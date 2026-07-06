import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

type AnalyzeRequest = {
  image?: string | null;
  text?: string | null;
};

type Category = "밥" | "국" | "반찬" | "기타";

type AiFoodCandidate = {
  name?: unknown;
  category?: unknown;
  origin?: unknown;
};

type AiMenuEntry = {
  day?: unknown;
  time?: unknown;
  foods?: unknown;
};

type AiAnalyzeData = {
  menus?: AiMenuEntry[];
  all_extracted_foods?: AiFoodCandidate[];
  new_foods?: AiFoodCandidate[];
  [key: string]: unknown;
};

type NormalizedFood = {
  name: string;
  category: Category;
  origin?: string;
};

type ParsedFoodText = {
  name: string;
  origin?: string;
};

type NormalizedMenu = {
  names: string[];
  foods: NormalizedFood[];
};

const CATEGORIES: Category[] = ["밥", "국", "반찬", "기타"];
const ORIGIN_TERMS = [
  "국내산",
  "국산",
  "수입산",
  "외국산",
  "미국산",
  "호주산",
  "중국산",
  "브라질산",
  "러시아산",
  "노르웨이산",
  "칠레산",
  "스페인산",
  "캐나다산",
  "덴마크산",
  "독일산",
  "태국산",
  "베트남산",
  "뉴질랜드산",
  "일본산",
  "인도산",
  "멕시코산",
  "네덜란드산",
  "프랑스산",
  "이탈리아산",
  "대만산",
  "인도네시아산",
  "말레이시아산",
  "필리핀산",
  "원양산",
];
const INGREDIENT_ORIGIN_LABELS = [
  "돈육",
  "돼지고기",
  "소고기",
  "쇠고기",
  "우육",
  "계육",
  "닭고기",
  "오리고기",
  "오리",
  "고등어",
  "갈치",
  "오징어",
  "낙지",
  "주꾸미",
  "쭈꾸미",
  "새우",
  "명태",
  "동태",
  "코다리",
  "참치",
  "두부",
  "콩",
  "배추",
  "고춧가루",
  "쌀",
];

const getErrorMessage = (error: unknown) => (
  error instanceof Error ? error.message : "Failed to analyze image"
);

const isCategory = (value: unknown): value is Category => (
  CATEGORIES.includes(value as Category)
);

const cleanText = (value: string) => (
  value.replace(/\s+/g, " ").trim()
);

const isOriginOnly = (value: string) => {
  const parts = value
    .replace(/[()[\]{}]/g, " ")
    .split(/[\s,./·+|]+/)
    .map(part => part.trim())
    .filter(Boolean);

  return parts.length > 0 && parts.every(part => ORIGIN_TERMS.includes(part));
};

const mergeOrigin = (current: string | undefined, next: string | undefined) => {
  if (!next) return current;
  if (!current) return next;

  const parts = current.split(",").map(part => part.trim());
  return parts.includes(next) ? current : `${current}, ${next}`;
};

const splitFoodNameAndOrigin = (rawName: string): ParsedFoodText => {
  const value = cleanText(rawName);
  const originMatches = ORIGIN_TERMS
    .map(term => ({ term, index: value.indexOf(term) }))
    .filter(match => match.index >= 0)
    .sort((a, b) => a.index - b.index);

  const firstOrigin = originMatches[0];
  if (!firstOrigin || firstOrigin.index <= 0) {
    return { name: value };
  }

  const beforeOrigin = cleanText(
    value.slice(0, firstOrigin.index).replace(/[:：([{\-–—]+$/, "")
  );
  const originText = cleanText(
    value.slice(firstOrigin.index).replace(/^[\s:：([{\-–—]+|[\s)\]}]+$/g, "")
  );

  if (!beforeOrigin || !originText) {
    return { name: value };
  }

  const tokens = beforeOrigin.split(/\s+/);
  const lastToken = tokens[tokens.length - 1];
  if (tokens.length > 1 && INGREDIENT_ORIGIN_LABELS.includes(lastToken)) {
    return {
      name: tokens.slice(0, -1).join(" "),
      origin: `${lastToken}:${originText}`
    };
  }

  return { name: beforeOrigin, origin: originText };
};

const isIngredientOriginNote = ({ name, origin }: ParsedFoodText) => (
  !!origin && INGREDIENT_ORIGIN_LABELS.includes(cleanText(name))
);

const formatIngredientOriginNote = ({ name, origin }: ParsedFoodText) => {
  if (!origin) return undefined;
  const cleanName = cleanText(name);
  const cleanOrigin = cleanText(origin);
  return cleanOrigin.includes(":") || cleanOrigin.includes("：")
    ? cleanOrigin
    : `${cleanName}:${cleanOrigin}`;
};

const normalizeOriginText = (origin: string) => {
  const parsed = splitFoodNameAndOrigin(origin);
  return isIngredientOriginNote(parsed)
    ? formatIngredientOriginNote(parsed)
    : cleanText(origin);
};

const normalizeFoodCandidate = (food: AiFoodCandidate): NormalizedFood | null => {
  if (typeof food.name !== "string") return null;

  let { name, origin } = splitFoodNameAndOrigin(food.name);
  const rawOrigin = typeof food.origin === "string" ? normalizeOriginText(food.origin) : "";

  if (isOriginOnly(name)) {
    if (rawOrigin && !isOriginOnly(rawOrigin)) {
      name = rawOrigin;
      origin = name ? cleanText(food.name) : undefined;
    } else {
      return null;
    }
  } else if (!origin && rawOrigin) {
    origin = rawOrigin;
  }

  name = cleanText(name);
  if (!name || isOriginOnly(name)) return null;
  if (isIngredientOriginNote({ name, origin })) return null;

  return {
    name,
    category: isCategory(food.category)
      ? food.category
      : INGREDIENT_ORIGIN_LABELS.includes(name)
        ? "반찬"
        : "기타",
    origin: origin ? cleanText(origin) : undefined
  };
};

const normalizeMenuFoods = (foods: unknown[]): NormalizedMenu => {
  const normalizedFoods: NormalizedFood[] = [];

  foods.forEach(food => {
    if (typeof food !== "string") return;

    const parsed = splitFoodNameAndOrigin(food);
    const name = cleanText(parsed.name);
    if (!name || isOriginOnly(name)) return;

    if (isIngredientOriginNote(parsed)) {
      const previousFood = normalizedFoods[normalizedFoods.length - 1];
      if (previousFood) {
        previousFood.origin = mergeOrigin(previousFood.origin, formatIngredientOriginNote(parsed));
      }
      return;
    }

    normalizedFoods.push({
      name,
      category: INGREDIENT_ORIGIN_LABELS.includes(name) ? "반찬" : "기타",
      origin: parsed.origin ? cleanText(parsed.origin) : undefined
    });
  });

  return {
    names: normalizedFoods.map(food => food.name),
    foods: normalizedFoods
  };
};

const sanitizeAiData = (data: AiAnalyzeData): AiAnalyzeData => {
  const foods = (data.all_extracted_foods || data.new_foods || [])
    .map(normalizeFoodCandidate)
    .filter((food): food is NormalizedFood => food !== null);
  const menuNormalizations = Array.isArray(data.menus)
    ? data.menus.map(menu => ({
      menu,
      normalized: normalizeMenuFoods(Array.isArray(menu.foods) ? menu.foods : [])
    }))
    : [];
  const uniqueFoodMap = new Map(foods.map(food => [food.name, food]));

  menuNormalizations.forEach(({ normalized }) => {
    normalized.foods.forEach(food => {
      const existingFood = uniqueFoodMap.get(food.name);
      if (existingFood) {
        uniqueFoodMap.set(food.name, {
          ...existingFood,
          origin: mergeOrigin(existingFood.origin, food.origin)
        });
      } else {
        uniqueFoodMap.set(food.name, food);
      }
    });
  });

  const uniqueFoods = Array.from(uniqueFoodMap.values());

  return {
    ...data,
    menus: menuNormalizations.map(({ menu, normalized }) => ({
      ...menu,
      foods: normalized.names
    })),
    all_extracted_foods: uniqueFoods,
    new_foods: uniqueFoods
  };
};

export async function POST(req: Request) {
  try {
    const { image, text } = await req.json() as AnalyzeRequest;

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
        {"name": "메뉴이름", "category": "밥/국/반찬/기타", "origin": "원산지"}
      ]
    }

    Rules:
    1. Scan the entire image/text and extract ALL food items from EVERY cell.
    2. 'all_extracted_foods' must contain a unique list of ALL food items found in the 'menus' section.
    3. For 'category', choose strictly from ['밥', '국', '반찬', '기타'].
       - If it's a soup/stew, it's '국'.
       - If it's rice/porridge, it's '밥'.
       - If it's a side dish or main dish (meat, fish, vegetables, kimchi), it's '반찬'.
       - If it's a beverage (milk, yogurt, juice), dessert, fruit, bread, snack, or other miscellaneous item, it's '기타'.
    4. Origin handling is CRITICAL:
       - Origin words such as "국내산", "국산", "수입산", "미국산", "호주산", "중국산" must NEVER be used as a food name.
       - If a phrase is only an ingredient-origin note such as "돈육 국내산", "돈육:국내산", or "돈육(국내산)", do NOT create a separate food item for it.
       - Attach ingredient-origin notes to the closest dish in the same table cell or line group.
       Example: "제육볶음 돈육 국내산" -> {"name":"제육볶음","category":"반찬","origin":"돈육:국내산"}.
       - If "순대야채볶음" and "돈육 국내산" are in the same cell, output one item: {"name":"순대야채볶음","category":"반찬","origin":"돈육:국내산"}.
       - Do not drop the ingredient word before the origin. Never output {"name":"국내산"} or {"name":"돈육"} for an origin note.
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

    const data = JSON.parse(jsonMatch[0]) as AiAnalyzeData;
    return NextResponse.json(sanitizeAiData(data));
  } catch (error: unknown) {
    console.error("AI Analysis Error:", error);
    return NextResponse.json({ 
      error: getErrorMessage(error)
    }, { status: 500 });
  }
}
