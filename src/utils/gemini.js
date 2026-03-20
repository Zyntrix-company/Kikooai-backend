import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.AI_API_KEY);

export function getModel(modelName = process.env.AI_MODEL || 'gemini-1.5-flash') {
  return genAI.getGenerativeModel({ model: modelName });
}

export default genAI;
