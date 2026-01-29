
import { GoogleGenAI, Type } from "@google/genai";
import { AuditReport, IssueType, Severity } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.OBJECT,
      properties: {
        totalPackages: { type: Type.NUMBER },
        vulnerabilities: { type: Type.NUMBER },
        outdated: { type: Type.NUMBER },
        deprecated: { type: Type.NUMBER },
        healthScore: { type: Type.NUMBER },
      },
      required: ["totalPackages", "vulnerabilities", "outdated", "deprecated", "healthScore"],
    },
    details: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          currentVersion: { type: Type.STRING },
          suggestedVersion: { type: Type.STRING },
          issueType: { type: Type.STRING, enum: Object.values(IssueType) },
          severity: { type: Type.STRING, enum: Object.values(Severity) },
          description: { type: Type.STRING },
          remediation: { type: Type.STRING },
          links: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["name", "currentVersion", "suggestedVersion", "issueType", "severity", "description", "remediation"],
      },
    },
    dependencyTree: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        attributes: {
          type: Type.OBJECT,
          properties: {
            version: { type: Type.STRING },
            status: { type: Type.STRING }
          }
        },
        children: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              attributes: {
                type: Type.OBJECT,
                properties: {
                  version: { type: Type.STRING },
                  status: { type: Type.STRING }
                }
              },
              children: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING } } } }
            }
          }
        }
      },
      required: ["name"]
    },
    generalAdvice: { type: Type.STRING },
  },
  required: ["summary", "details", "dependencyTree", "generalAdvice"],
};

export async function analyzePackageJson(content: string): Promise<AuditReport> {
  try {
    JSON.parse(content);
  } catch (e) {
    throw new Error("Invalid JSON format in package.json.");
  }

  const prompt = `
    Analyze this package.json for security and health.
    
    IMPORTANT RULES TO AVOID ERRORS:
    1. DO NOT LOOP. Do not repeat the same package names multiple times in the tree.
    2. LIMIT TREE DEPTH: Only include direct dependencies in 'dependencyTree'. Do not include deep nested sub-dependencies unless they are vulnerabilities.
    3. BE CONCISE: Ensure the total output is under 4000 tokens. 
    4. VALID JSON: Ensure all strings and objects are properly closed.
    
    Package.json:
    ${content}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: ANALYSIS_SCHEMA,
        temperature: 0.1, // Lower temperature to reduce hallucinations and repetition
      },
    });

    let text = response.text || "";
    
    // Attempt to handle common truncated JSON issues if they occur
    if (text.lastIndexOf('}') < text.lastIndexOf('{')) {
       // Heuristic: If we have more open braces than closed, it might be truncated.
       // However, with responseSchema, the model usually manages this better.
    }

    try {
      return JSON.parse(text.trim()) as AuditReport;
    } catch (parseError) {
      console.error("Raw text for debugging:", text);
      throw new Error("The AI provided a report that was too long or malformed. Try a smaller package.json or check if a single dependency has too many issues.");
    }
  } catch (error: any) {
    console.error("Gemini analysis error:", error);
    throw new Error(error.message || "An error occurred during AI analysis.");
  }
}
