const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());

const apiKey = process.env.GEMINI_API_KEY;
const airtableBaseId = process.env.AIRTABLE_BASE_ID;
const airtableApiKey = process.env.AIRTABLE_API_KEY;

const genAI = new GoogleGenerativeAI({ apiKey });

const generationConfig = {
  temperature: 1,
  top_p: 0.95,
  top_k: 64,
  max_output_tokens: 8192,
};

const safetySettings = [
  {
    category: "HARM_CATEGORY_HARASSMENT",
    threshold: "BLOCK_MEDIUM_AND_ABOVE",
  },
  {
    category: "HARM_CATEGORY_HATE_SPEECH",
    threshold: "BLOCK_MEDIUM_AND_ABOVE",
  },
  {
    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    threshold: "BLOCK_MEDIUM_AND_ABOVE",
  },
  {
    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
    threshold: "BLOCK_MEDIUM_AND_ABOVE",
  },
];

const systemInstruction = `
You are a document entity extraction specialist for a school that gives you assessments. 
Given an assessment, your task is to extract the text value of the following entities:
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
  ]
}
- The JSON schema must be followed during the extraction.
- The values must only include text strings found in the document.
- Generate null for missing entities.
`;

async function fetchAirtableRecord(recordId) {
  try {
    const response = await axios.get(`https://api.airtable.com/v0/${airtableBaseId}/Assessment%20converter/${recordId}`, {
      headers: {
        Authorization: `Bearer ${airtableApiKey}`,
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching Airtable record:', error);
    throw error;
  }
}

async function updateAirtableRecord(recordId, output) {
  try {
    const response = await axios.patch(`https://api.airtable.com/v0/${airtableBaseId}/Assessment%20converter/${recordId}`, {
      fields: {
        Output: JSON.stringify(output),
      },
    }, {
      headers: {
        Authorization: `Bearer ${airtableApiKey}`,
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error updating Airtable record:', error);
    throw error;
  }
}

async function sendToGeminiAI(documentUrl) {
  try {
    const response = await genAI.generate({
      model: 'gemini-1.5-flash',
      prompt: documentUrl,
      temperature: generationConfig.temperature,
      top_p: generationConfig.top_p,
      top_k: generationConfig.top_k,
      max_output_tokens: generationConfig.max_output_tokens,
      safety_settings: safetySettings,
      system_instruction: systemInstruction,
    });

    return response.data.output;
  } catch (error) {
    console.error('Error sending to Gemini AI:', error.response ? error.response.data : error.message);
    throw error;
  }
}

app.post('/process-assessment', async (req, res) => {
  const { recordId } = req.body;

  try {
    // Fetch the record from Airtable to get the file URL
    const record = await fetchAirtableRecord(recordId);
    const filePath = record.fields.Upload[0].url;

    console.log('Fetched Airtable record:', record);
    console.log('File path:', filePath);

    // Send the document URL to Gemini AI
    const output = await sendToGeminiAI(filePath);

    console.log('Gemini AI output:', output);

    // Update the Airtable record with the output
    await updateAirtableRecord(recordId, output);

    res.json({ success: true, output: output });
  } catch (error) {
    console.error('Error processing assessment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
