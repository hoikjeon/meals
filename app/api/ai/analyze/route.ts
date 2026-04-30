import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: Request) {
  try {
    const { image, text } = await req.json();

    // 모델 설정 (사용자 요청: Gemini 3 Flash Preview)
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    const prompt = `Analyze this hospital weekly meal plan image or text and provide a structured JSON response. 
    You MUST extract EVERY single food item mentioned in the entire table. Do not skip any day or any meal time.

    Translate and format strictly as following JSON structure:
    {
      "menus": [
        {"day": "월", "time": "아침", "foods": ["메뉴1", "메뉴2", ...]},
        ...
      ],
      "all_extracted_foods": [
        {"name": "메뉴이름", "category": "밥/국/반찬", "origin": "원산지"}
      ]
    }

    Rules:
    1. Scan the entire image/text and extract ALL food items from EVERY cell.
    2. 'all_extracted_foods' must contain a unique list of ALL food items found in the 'menus' section.
    3. For 'category', choose strictly from ['밥', '국', '반찬'].
       - If it's a soup/stew, it's '국'.
       - If it's rice/porridge, it's '밥'.
       - Everything else is '반찬'.
    4. If origin info is next to a food (e.g., "쇠고기:국내산"), extract it into the 'origin' field and keep the 'name' clean.
    5. Language: Korean.
    6. Output ONLY the JSON.`;

    let result;
    if (image) {
      result = await model.generateContent([
        prompt,
        { inlineData: { data: image, mimeType: "image/jpeg" } }
      ]);
    } else {
      result = await model.generateContent(prompt + "\n\nText to analyze:\n" + text);
    }

    const response = await result.response;
    const responseText = response.text();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("AI가 유효한 JSON 데이터를 생성하지 못했습니다.");
    }

    const data = JSON.parse(jsonMatch[0]);
    // Ensure the key matches what the client expects, or update client
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    return NextResponse.json({ 
      error: error.message || "Failed to analyze image" 
    }, { status: 500 });
  }
}
