const express = require('express');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const app = express();
app.use(express.json());

const apiKey = 'YOUR_API_KEY';

const generationConfig = {
  "temperature": 1,
  "top_p": 0.95,
  "top_k": 64,
  "max_output_tokens": 8192,
};

const safetySettings = [
  {
    "category": "HARM_CATEGORY_HARASSMENT",
    "threshold": "BLOCK_MEDIUM_AND_ABOVE"
  },
  {
    "category": "HARM_CATEGORY_HATE_SPEECH",
    "threshold": "BLOCK_MEDIUM_AND_ABOVE"
  },
  {
    "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    "threshold": "BLOCK_MEDIUM_AND_ABOVE"
  },
  {
    "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
    "threshold": "BLOCK_MEDIUM_AND_ABOVE"
  },
];

const systemInstruction = `You are a document entity extraction specialist for a school that gives you assessments. Given an assessment, your task is to extract the text value of the following entities:
{
  "question": [
    {
      "question_number": "",
      "total_marks": "",
      "question_text": "",
      "marking_guide": ""
    }
  ],
  "answer": [
    {
      "question_number": "",
      "student_answer": ""
    }
  ],
}
- The JSON schema must be followed during the extraction.
- The values must only include text strings found in the document.
- Generate null for missing entities.`;

async function extractPdfText(filePath) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));

  const response = await axios.post('YOUR_PDF_EXTRACTION_API_ENDPOINT', form, {
    headers: {
      ...form.getHeaders(),
      'Authorization': `Bearer ${apiKey}`
    }
  });

  return response.data.pages; // assuming the API returns an array of pages
}

async function sendToGeminiAI(pages) {
  const response = await axios.post('https://gemini.googleapis.com/v1beta2/models/gemini-1.5-flash:generateText', {
    "generationConfig": generationConfig,
    "safetySettings": safetySettings,
    "systemInstruction": systemInstruction,
    "userInput": pages
  }, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  return response.data.output;
}

app.post('/process-assessment', async (req, res) => {
  const { recordId } = req.body;

  try {
    // Fetch the record from Airtable to get the file URL
    const record = await fetchAirtableRecord(recordId);
    const filePath = record.fields.Upload[0].url;

    // Extract text from PDF
    const pages = await extractPdfText(filePath);

    // Send extracted text to Gemini AI
    const output = await sendToGeminiAI(pages);

    // Update the Airtable record with the output
    await updateAirtableRecord(recordId, output);

    res.json({ success: true, output: output });
  } catch (error) {
    console.error('Error processing assessment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

async function fetchAirtableRecord(recordId) {
  const response = await axios.get(`https://api.airtable.com/v0/YOUR_BASE_ID/Assessment%20converter/${recordId}`, {
    headers: {
      'Authorization': `Bearer YOUR_AIRTABLE_API_KEY`
    }
  });

  return response.data;
}

async function updateAirtableRecord(recordId, output) {
  const response = await axios.patch(`https://api.airtable.com/v0/YOUR_BASE_ID/Assessment%20converter/${recordId}`, {
    fields: {
      Output: JSON.stringify(output)
    }
  }, {
    headers: {
      'Authorization': `Bearer YOUR_AIRTABLE_API_KEY`,
      'Content-Type': 'application/json'
    }
  });

  return response.data;
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});