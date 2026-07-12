import { GoogleGenAI } from "@google/genai";

let ai: GoogleGenAI | null = null;

const getAIInstance = (): GoogleGenAI => {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY || "";
    if (!apiKey) {
      console.error("Gemini API Key is missing from environment variables (process.env.GEMINI_API_KEY)");
    }
    ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        }
      }
    });
  }
  return ai;
};

const SYSTEM_INSTRUCTION = `
You are Ankesh's professional AI Assistant, an intelligent and highly knowledgeable Compliance Assistant for this portfolio website. Your goal is to provide accurate, concise, and natural responses regarding Ankesh's professional experience, as well as domain-specific guidance on Audit, GST, Income Tax, ROC Compliance, Company Law, Transfer Pricing, and general finance topics.

Ankesh Kumar is a CA Finalist & CA Article Assistant currently pursuing his training at GPHK & Associates. He holds a B.Com in Computer Applications.

PORTFOLIO & WEBSITE CONTEXT (CRITICAL):
You are the AI Assistant for *this specific portfolio website*. Always prioritize the information on this website first.
- **PDF Toolkit (#pdf-toolkit)**: An entirely browser-based, client-side PDF processing utility. It contains 14 professional tools, notably:
  * Organize PDF: Reorder, rotate, or delete pages in a rich visual editor.
  * Redact PDF: Blackout sensitive and confidential text or figures locally.
  * OCR (Extract Text): Extract structured text from scanned documents using local image analysis.
  * Merge, Split, and Compress PDF: Process large ledgers, tax folders, or audit records cleanly.
  * Rotate, Delete, Extract, Watermark, Protect, Unlock, and Image/PDF conversions.
  *Privacy & Security*: All PDF operations run locally in-browser (zero server uploads, fully private).
- **Compliance Workspace & Suite (#compliance-hub / #tech-compliance-desk)**: 
  * GST Reconciliation: Upload Purchase Register and GSTR-2B logs to instantly perform automated invoice audits and matches.
  * GSTIN Lookup & Verification: Query live registration status and active compliance histories.
  * Tax Regime Comparative Engine: Dynamically compare Old vs New income tax slab structures.
  * Incorporation Countdown: Track ROC milestones and MCA registration phases.
- **Navigation Sections**:
  * About (#about): Background on Ankesh's CA training.
  * Experience (#experience): Professional exposure and statutory audits.
  * Compliance Hub (#compliance-hub)
  * PDF Toolkit (#pdf-toolkit)
  * Contact (#contact): Ways to connect.
- **Recommendation Rule**: When asked about compliance, audits, or PDF tools, always proactively suggest our flagship built-in solutions: GST Reconciliation, Compliance Workspace, Organize PDF, Redact PDF, and OCR. Do NOT recommend external software unless the user explicitly asks for alternatives.

CRITICAL CONVERSATIONAL & PERSONA GUIDELINES:
1. **Natural, Conversational & Professional Tone:** Act as a helpful compliance expert. Be clear, warm, and highly professional.
2. **No Repetitive Self-Introductions:** Do not begin responses with "I am Ankesh's Professional AI Assistant" or repeat his entire bio unless specifically requested. Assume the user knows where they are.
3. **Answer Briefly First:** Keep initial answers highly concise, direct, and focused. Provide a brief overview first, and expand with more detailed sections or breakdowns ONLY if explicitly requested by the user.
4. **Never Invent Facts:** If information is uncertain, clearly state that you do not have that specific information.
5. **Secure Local Processing / Privacy:** For uploaded invoices, receipts, GST notices, ROC documents, balance sheets, or financial statements, reassure the user that their files are processed entirely securely and privately within their browser session (no external data sharing).
6. **Technical & CA Finalist Status:** Represent Ankesh strictly as a CA Finalist and Article Assistant currently in training. Provide domain guidance on Tax, Audit, and Law neutrally, accurately, and professionally.
7. **Contact & Hiring Details:** Only share his email ('ankeshkumar9949@gmail.com') if the user explicitly asks how to contact him, or inquiries about hiring/networking.
8. **WhatsApp inquiries:** If asked for WhatsApp details, suggest sending an email to 'ankeshkumar9949@gmail.com'.
9. **Casual Greetings:** Keep greetings short (e.g., "Hello! How can I assist you with your compliance or tax inquiries today?"). No lists or menus for a simple greeting.

Key Expertise & Experience Details:
- CA Article Assistant at GPHK & Associates (Dec 2024 – Present)
- Coordinated fieldwork for 30+ Statutory & 15+ Tax Audits.
- Filed and reconciled 100+ GST Returns.
- Supported Form 3CEB, Study Reports, and Benchmarking for clients with turnover > ₹300 Cr.
- Proficient in Tally Prime, QuickBooks, Focus, and Advanced Excel.
`;

const cleanSourceTitle = (title: string, uri: string): string => {
  const isGeneric = !title || 
                    title.toLowerCase().includes("vertexaisearch") || 
                    title.toLowerCase().includes("google.com") ||
                    title.startsWith("http://") || 
                    title.startsWith("https://");
  
  if (isGeneric && uri) {
    try {
      const url = new URL(uri);
      const hostname = url.hostname.replace("www.", "");
      if (hostname === "incometax.gov.in") return "Income Tax Department";
      if (hostname === "gst.gov.in") return "GST Portal";
      if (hostname === "icai.org") return "ICAI Official Portal";
      if (hostname === "mca.gov.in") return "MCA Portal";
      if (hostname === "cbic.gov.in") return "CBIC Portal";
      
      const urlParts = hostname.split(".");
      if (urlParts.length > 1) {
        const domainName = urlParts[urlParts.length - 2];
        return domainName.charAt(0).toUpperCase() + domainName.slice(1) + ` (${hostname})`;
      }
      return hostname;
    } catch {
      return title || "Web Resource";
    }
  }
  return title;
};

export interface GeminiResponse {
  text: string;
  sources?: { title: string; uri: string }[];
}

export const executeGeminiChat = async (
  message: string, 
  history: { role: string; parts: { text: string }[] }[],
  image?: { mimeType: string; data: string }
): Promise<GeminiResponse> => {
  try {
    const client = getAIInstance();
    const model = "gemini-3.5-flash";
    
    // Real-time information detection for Google Search Grounding
    const isRealTime = /latest notification|recent circular|today|current amendment|breaking news/i.test(message);
    const tools = isRealTime ? [{ googleSearch: {} }] : undefined;

    // 2. Build contents array with message history
    const rawContents: any[] = [];
    for (const turn of history) {
      rawContents.push({
        role: turn.role === "user" ? "user" : "model",
        parts: turn.parts.map(p => ({ text: p.text }))
      });
    }

    // Add current user turn with optional image
    const currentParts: any[] = [];
    if (image) {
      currentParts.push({
        inlineData: {
          mimeType: image.mimeType,
          data: image.data
        }
      });
    }
    currentParts.push({ text: message });

    rawContents.push({
      role: "user",
      parts: currentParts
    });

    const contents: any[] = [];
    let expectedRole: "user" | "model" = "user";

    for (const item of rawContents) {
      if (item.parts.length === 0) continue;

      if (item.role === expectedRole) {
        contents.push(item);
        expectedRole = expectedRole === "user" ? "model" : "user";
      } else if (item.role === "user" && expectedRole === "model") {
        const lastItem = contents[contents.length - 1];
        if (lastItem) {
          lastItem.parts.push(...item.parts);
        } else {
          contents.push(item);
          expectedRole = "model";
        }
      } else if (item.role === "model" && expectedRole === "user") {
        const lastItem = contents[contents.length - 1];
        if (lastItem && lastItem.role === "model") {
          lastItem.parts.push(...item.parts);
        }
      }
    }

    const config: any = {
      systemInstruction: SYSTEM_INSTRUCTION,
    };

    if (tools) {
      config.tools = tools;
    }

    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error("Request timed out")), 55000)
    );

    const responsePromise = client.models.generateContent({
      model,
      contents,
      config
    });

    const response = await Promise.race([
      responsePromise,
      timeoutPromise
    ]);
    
    const sources: { title: string; uri: string }[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      for (const chunk of chunks) {
        if (chunk.web?.uri) {
          sources.push({
            title: cleanSourceTitle(chunk.web.title || "", chunk.web.uri),
            uri: chunk.web.uri
          });
        }
      }
    }

    // Deduplicate sources
    const uniqueSourcesMap = new Map<string, string>();
    sources.forEach(src => {
      uniqueSourcesMap.set(src.uri, src.title);
    });
    const uniqueSources = Array.from(uniqueSourcesMap.entries()).map(([uri, title]) => ({
      title,
      uri
    }));

    return {
      text: response.text || "I apologize, I couldn't process that request.",
      sources: uniqueSources.length > 0 ? uniqueSources : undefined
    };
  } catch (error: any) {
    const errorMessage = error?.message || "";
    const isQuotaError = errorMessage.includes("RESOURCE_EXHAUSTED") || 
                         errorMessage.includes("429") || 
                         errorMessage.includes("quota") ||
                         error?.name === "ApiError";

    if (isQuotaError) {
      console.log("Gemini API Quota Exceeded. Using friendly client-side fallback.");
      const fallbackText = handleFallbackResponse(message);
      return {
        text: `*[Note: The live API has reached its daily quota limit. Running in Interactive Local Mode]*\n\n${fallbackText}`
      };
    }

    console.error("Error communicating with Gemini (full details):", {
      name: error?.name,
      message: errorMessage,
      stack: error?.stack
    });
    
    if (errorMessage === "Request timed out") {
      return {
        text: "I apologize, but the search query timed out while scanning official tax portals. Please try again, or rephrase your question to be more specific."
      };
    }
    
    return {
      text: "I apologize, but I am currently experiencing a connection issue or unable to access the required portals at this moment. Please try again shortly."
    };
  }
};

const handleFallbackResponse = (message: string): string => {
  const msg = message.toLowerCase();

  // Greetings
  if (/hello|hi\b|hey\b|greetings|morning|afternoon/i.test(msg)) {
    return "Hello! I am Ankesh's professional Compliance Assistant. While the live Gemini API is currently experiencing a temporary high-traffic quota limit, I can still provide you with detailed information about Ankesh's expertise, his portfolio tools, or his professional background. How can I assist you today?";
  }

  // Who is Ankesh / Background
  if (/who is|about ankesh|tell me about|who are you/i.test(msg)) {
    return "Ankesh Kumar is a dedicated CA Finalist & CA Article Assistant currently undergoing rigorous training at GPHK & Associates. He holds a Bachelor of Commerce (B.Com) in Computer Applications, blending high-level statutory tax expertise with modern software development skills. He builds secure, client-side, privacy-first tools to automate compliance operations.";
  }

  // Experience / GPHK
  if (/experience|gphk|articleship|audit|career|background|work/i.test(msg)) {
    return "Ankesh has rich, hands-on experience as a CA Article Assistant at GPHK & Associates (since Dec 2024):\n\n" +
           "- **Statutory & Tax Audits**: Led and coordinated fieldwork for 30+ Statutory Audits and 15+ Tax Audits across diverse sectors.\n" +
           "- **GST & Direct Tax Compliance**: Successfully filed and reconciled over 100+ GST Returns and supported statutory compliance timelines.\n" +
           "- **International Tax & Transfer Pricing**: Conducted benchmarking studies and prepared Study Reports (including Form 3CEB) for large corporate clients with turnovers exceeding ₹300 Crore.\n" +
           "- **Digital Transformation**: Developed local tools to parse client ledgers, saving hundreds of manual audit hours.";
  }

  // Skills
  if (/skills|tally|quickbooks|excel|technologies|languages|code/i.test(msg)) {
    return "Ankesh possesses a unique, interdisciplinary skill set spanning financial compliance and software engineering:\n\n" +
           "- **Financial & Audit Tools**: Tally Prime, QuickBooks, Focus, Advanced Excel (complex macros, pivot tables, lookup models).\n" +
           "- **Compliance Domain**: Statutory Audits, Tax Audits, GST Filings, Income Tax Computations, ROC/MCA Filings, and Transfer Pricing.\n" +
           "- **Software Engineering**: Full-stack web development with React, TypeScript, Node.js, Express, Tailwind CSS, and WebAssembly (WASM) for secure client-side document processing.";
  }

  // Contact / Hire
  if (/contact|email|hire|phone|whatsapp|reach|resume/i.test(msg)) {
    return "You can get in touch with Ankesh Kumar directly through the following channels:\n\n" +
           "- **Email**: ankeshkumar9949@gmail.com\n" +
           "- **LinkedIn**: linkedin.com/in/ankeshkumar9949\n" +
           "- **GitHub**: github.com/ankeshkumar9949\n\n" +
           "Feel free to reach out via email to discuss professional opportunities, custom software development for tax compliance, or audit collaborations!";
  }

  // PDF Toolkit
  if (/pdf|toolkit|split|merge|compress|ocr|watermark|lock|organize|redact/i.test(msg)) {
    return "The **Offline PDF Toolkit** on this website is a flagship, privacy-first application built entirely with React and WebAssembly. It contains 14 professional tools operating 100% locally:\n\n" +
           "- **Organize PDF**: Reorder, rotate, or delete pages with a visual interface.\n" +
           "- **Redact PDF**: Sanitize documents by blacking out confidential client info locally.\n" +
           "- **OCR text extraction**: Pull structured paragraphs and tables from scans without external processing.\n" +
           "- **Standard Utilities**: Merge, Split, and Compress files cleanly.\n" +
           "- **Privacy Guaranteed**: Your files process locally in browser memory and are never uploaded to any server.\n\n" +
           "You can test these tools directly in the **PDF Toolkit** section!";
  }

  // Compliance Hub / Suite / MCA / GST Reconciliation
  if (/compliance|hub|suite|mca|gstin|regime|tax|reconciliation|gst/i.test(msg)) {
    return "The **Compliance Workspace** contains flagship, real-time utilities designed for CA and audit teams:\n\n" +
           "- **GST Reconciliation**: Upload Purchase Registers and GSTR-2B data logs to perform instant, client-side mismatch audits and credit validation.\n" +
           "- **GSTIN Validation**: Instantly lookup GSTIN structures and state jurisdictions.\n" +
           "- **Tax Regime Comparative Engine**: Compare liability under Old vs New Indian Tax regimes.\n" +
           "- **Incorporation Countdown**: Formulate timeline schedules for ROC / MCA milestone filings.\n\n" +
           "Explore these active utilities under the **Compliance Hub** section of the portfolio!";
  }

  // Default helpful response
  return "I am Ankesh's professional Compliance Assistant. While the live Gemini API is currently experiencing a temporary high-traffic quota limit, I can still assist you with information about Ankesh's credentials, his CA articleship, or his built-in tools.\n\n" +
         "Here are some topics you can ask me about:\n" +
         "1. **GST Reconciliation Workspace**: Automated multi-sheet mismatch auditing.\n" +
         "2. **Offline PDF Toolkit**: Featuring Organize PDF, Redact PDF, OCR, and 11 other local tools.\n" +
         "3. **Ankesh's Experience** at GPHK & Associates (30+ Statutory Audits).\n" +
         "4. **His Tech Stack & Skills** (Tally, Advanced Excel, React, WASM).\n" +
         "5. **How to Contact Him** or schedule an interview.";
};
