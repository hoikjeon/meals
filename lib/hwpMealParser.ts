import type { DayOfWeek, MealTime } from './types';

const DAYS: DayOfWeek[] = ['월', '화', '수', '목', '금', '토', '일'];
const TIMES: MealTime[] = ['아침', '점심', '저녁'];
const MAX_HWP_FILE_SIZE = 20 * 1024 * 1024;

type RhwpModule = typeof import('@rhwp/core');

type HwpControl = {
  ctrlId?: string;
  list?: number;
  para?: number;
  controlIndex?: number;
};

type ParsedCell = {
  lines: string[];
  text: string;
};

export type ImportedMealFood = {
  name: string;
  origin?: string;
};

export type ImportedMealEntry = {
  day: DayOfWeek;
  time: MealTime;
  foods: ImportedMealFood[];
};

export type ImportedDayHeader = {
  day: DayOfWeek;
  label: string;
  date: string;
  note?: string;
};

export type HwpMealPlan = {
  fileName: string;
  headers: ImportedDayHeader[];
  menus: ImportedMealEntry[];
  weekStart: string;
  originText: string;
  warnings: string[];
  itemCount: number;
  tableSize: {
    rows: number;
    columns: number;
  };
};

declare global {
  // @rhwp/core가 한글 글꼴의 폭을 계산할 때 호출하는 브라우저 콜백이다.
  var measureTextWidth: ((font: string, text: string) => number) | undefined;
}

let hwpCorePromise: Promise<RhwpModule> | null = null;
let measureContext: CanvasRenderingContext2D | null = null;
let lastMeasureFont = '';

const cleanText = (value: string) => value.replace(/\s+/g, ' ').trim();

const ensureTextMeasurement = () => {
  if (typeof globalThis.measureTextWidth === 'function') return;

  globalThis.measureTextWidth = (font, text) => {
    if (!measureContext) {
      measureContext = document.createElement('canvas').getContext('2d');
    }
    if (!measureContext) return Array.from(text).length * 10;
    if (font !== lastMeasureFont) {
      measureContext.font = font;
      lastMeasureFont = font;
    }
    return measureContext.measureText(text).width;
  };
};

const loadHwpCore = async () => {
  if (typeof window === 'undefined') {
    throw new Error('HWP 파일은 브라우저에서만 분석할 수 있습니다.');
  }

  if (!hwpCorePromise) {
    hwpCorePromise = import('@rhwp/core')
      .then(async (core) => {
        ensureTextMeasurement();
        await core.default();
        return core;
      })
      .catch((error) => {
        hwpCorePromise = null;
        throw error;
      });
  }

  return hwpCorePromise;
};

const readCell = (cell: HTMLTableCellElement): ParsedCell => {
  const paragraphLines = Array.from(cell.children)
    .filter((child) => child.tagName === 'P')
    .map((paragraph) => cleanText(paragraph.textContent || ''))
    .filter(Boolean);
  const lines = paragraphLines.length > 0
    ? paragraphLines
    : [cleanText(cell.textContent || '')].filter(Boolean);

  return {
    lines,
    text: cleanText(lines.join(' ')),
  };
};

const buildTableGrid = (table: HTMLTableElement) => {
  const sourceRows = Array.from(table.rows);
  const grid: ParsedCell[][] = Array.from({ length: sourceRows.length }, () => []);

  sourceRows.forEach((row, rowIndex) => {
    let columnIndex = 0;

    Array.from(row.cells).forEach((cellElement) => {
      while (grid[rowIndex][columnIndex]) columnIndex += 1;

      const cell = readCell(cellElement);
      const rowSpan = Math.max(1, cellElement.rowSpan || 1);
      const columnSpan = Math.max(1, cellElement.colSpan || 1);

      for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
        const targetRow = rowIndex + rowOffset;
        if (!grid[targetRow]) grid[targetRow] = [];
        for (let columnOffset = 0; columnOffset < columnSpan; columnOffset += 1) {
          grid[targetRow][columnIndex + columnOffset] = cell;
        }
      }

      columnIndex += columnSpan;
    });
  });

  return grid;
};

const inferYearFromFileName = (fileName: string, fallbackYear: number) => {
  const match = fileName.match(/(?:^|\D)(\d{4}|\d{2})\s*(?:년|\.)\s*\d{1,2}\s*월/);
  if (!match) return fallbackYear;

  const parsed = Number(match[1]);
  if (match[1].length === 4) return parsed;
  return parsed >= 70 ? 1900 + parsed : 2000 + parsed;
};

const formatDate = (year: number, month: number, day: number) => (
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
);

const parseDayHeaders = (
  headerRow: ParsedCell[],
  fileName: string,
  fallbackYear: number,
  warnings: string[],
) => {
  const inferredYear = inferYearFromFileName(fileName, fallbackYear);
  let rollingYear = inferredYear;
  let previousMonth: number | null = null;

  const headers = headerRow.slice(1, 8).map((cell, index): ImportedDayHeader => {
    const label = cell?.text || '';
    const match = label.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\(([월화수목금토일])\)(.*)$/);
    if (!match) {
      throw new Error(`${index + 1}번째 날짜 열을 읽을 수 없습니다: ${label || '(빈 칸)'}`);
    }

    const month = Number(match[1]);
    const dayOfMonth = Number(match[2]);
    const day = match[3] as DayOfWeek;
    const note = cleanText(match[4] || '');

    if (previousMonth === 12 && month === 1) rollingYear += 1;
    previousMonth = month;

    const date = new Date(rollingYear, month - 1, dayOfMonth);
    if (
      date.getFullYear() !== rollingYear ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== dayOfMonth
    ) {
      throw new Error(`유효하지 않은 날짜입니다: ${label}`);
    }

    const expectedDay = DAYS[(date.getDay() + 6) % 7];
    if (expectedDay !== day) {
      warnings.push(`${label}: 날짜와 요일이 일치하지 않습니다.`);
    }

    return {
      day,
      label: `${month}/${String(dayOfMonth).padStart(2, '0')}(${day})`,
      date: formatDate(rollingYear, month, dayOfMonth),
      note: note || undefined,
    };
  });

  if (headers.length !== 7 || new Set(headers.map((header) => header.day)).size !== 7) {
    throw new Error('월요일부터 일요일까지 7개의 날짜 열을 찾지 못했습니다.');
  }

  return headers;
};

const isOriginText = (value: string) => (
  /[:：]/.test(value)
  || /(?:국내산|국산|수입산|외국산|원양산)$/.test(value)
);

const mergeOrigin = (current: string | undefined, next: string) => (
  current && current !== next ? `${current}, ${next}` : current || next
);

const parseFoodLines = (cell: ParsedCell | undefined, warnings: string[]) => {
  const foods: ImportedMealFood[] = [];

  for (const rawLine of cell?.lines || []) {
    const line = cleanText(rawLine);
    if (!line) continue;

    const originOnlyMatch = line.match(/^\((.+)\)$/);
    if (originOnlyMatch && isOriginText(originOnlyMatch[1])) {
      const previousFood = foods.at(-1);
      if (previousFood) {
        previousFood.origin = mergeOrigin(previousFood.origin, cleanText(originOnlyMatch[1]));
      } else {
        warnings.push(`연결할 음식이 없는 원산지 문구가 있습니다: ${line}`);
      }
      continue;
    }

    const trailingOriginMatch = line.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
    if (trailingOriginMatch && trailingOriginMatch[1] && isOriginText(trailingOriginMatch[2])) {
      foods.push({
        name: cleanText(trailingOriginMatch[1]),
        origin: cleanText(trailingOriginMatch[2]),
      });
      continue;
    }

    foods.push({ name: line });
  }

  return foods;
};

const getUniqueRowTexts = (row: ParsedCell[]) => {
  const visited = new Set<ParsedCell>();
  const texts: string[] = [];

  row.forEach((cell) => {
    if (!cell || visited.has(cell)) return;
    visited.add(cell);
    if (cell.text) texts.push(cell.text);
  });

  return texts;
};

const parseMealTableHtml = (
  html: string,
  fileName: string,
  fallbackYear: number,
): HwpMealPlan | null => {
  const htmlDocument = new DOMParser().parseFromString(html, 'text/html');
  const table = htmlDocument.querySelector('table');
  if (!table) return null;

  const grid = buildTableGrid(table);
  const headerRowIndex = grid.findIndex((row) => (
    row[0]?.text === '구분'
    && row.slice(1, 8).filter((cell) => /\d{1,2}\s*\/\s*\d{1,2}/.test(cell?.text || '')).length === 7
  ));
  if (headerRowIndex < 0) return null;

  const warnings: string[] = [];
  const headers = parseDayHeaders(grid[headerRowIndex], fileName, fallbackYear, warnings);
  const menuMap = new Map<string, ImportedMealEntry>();

  TIMES.forEach((time) => {
    DAYS.forEach((day) => {
      menuMap.set(`${time}-${day}`, { time, day, foods: [] });
    });
  });

  const foundTimes = new Set<MealTime>();
  let lastMealRowIndex = headerRowIndex;

  for (let rowIndex = headerRowIndex + 1; rowIndex < grid.length; rowIndex += 1) {
    const time = grid[rowIndex][0]?.text as MealTime;
    if (!TIMES.includes(time)) continue;

    foundTimes.add(time);
    lastMealRowIndex = rowIndex;
    headers.forEach((header, dayIndex) => {
      const entry = menuMap.get(`${time}-${header.day}`);
      if (!entry) return;
      entry.foods.push(...parseFoodLines(grid[rowIndex][dayIndex + 1], warnings));
    });
  }

  if (foundTimes.size !== TIMES.length) {
    throw new Error('아침·점심·저녁 영역을 모두 찾지 못했습니다.');
  }

  const menus = TIMES.flatMap((time) => (
    DAYS.map((day) => menuMap.get(`${time}-${day}`) as ImportedMealEntry)
  ));

  menus.forEach((menu) => {
    if (menu.foods.length === 0) {
      warnings.push(`${menu.day}요일 ${menu.time} 메뉴가 비어 있습니다.`);
    }
  });

  const originHeaderRowIndex = grid.findIndex((row, rowIndex) => (
    rowIndex > lastMealRowIndex
    && getUniqueRowTexts(row).some((text) => text.includes('원산지표시판'))
  ));
  const originText = originHeaderRowIndex >= 0
    ? grid
        .slice(originHeaderRowIndex)
        .flatMap(getUniqueRowTexts)
        .filter(Boolean)
        .join('\n')
    : '';

  if (!originText) warnings.push('원산지 표시판 내용을 찾지 못했습니다.');

  const mondayHeader = headers.find((header) => header.day === '월');
  if (!mondayHeader) throw new Error('월요일 날짜를 찾지 못했습니다.');

  return {
    fileName,
    headers,
    menus,
    weekStart: mondayHeader.date,
    originText,
    warnings,
    itemCount: menus.reduce((count, menu) => count + menu.foods.length, 0),
    tableSize: {
      rows: grid.length,
      columns: Math.max(...grid.map((row) => row.length)),
    },
  };
};

const assertSupportedFile = (file: File, bytes: Uint8Array) => {
  if (file.size === 0) throw new Error('파일 내용이 비어 있습니다.');
  if (file.size > MAX_HWP_FILE_SIZE) throw new Error('HWP 파일은 20MB 이하만 불러올 수 있습니다.');

  const isHwp5 = bytes.length >= 8
    && [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((byte, index) => bytes[index] === byte);
  const isHwpx = bytes.length >= 4
    && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

  if (!isHwp5 && !isHwpx) {
    throw new Error('올바른 HWP/HWPX 파일이 아닙니다.');
  }
};

export async function parseHwpMealFile(file: File, fallbackYear = new Date().getFullYear()) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  assertSupportedFile(file, bytes);

  const core = await loadHwpCore();
  const hwpDocument = new core.HwpDocument(bytes);

  try {
    const controls = JSON.parse(hwpDocument.getControls()) as HwpControl[];
    const tableControls = controls.filter((control) => control.ctrlId === 'tbl');
    const sectionCount = hwpDocument.getSectionCount();

    for (const control of tableControls) {
      if (typeof control.para !== 'number' || typeof control.controlIndex !== 'number') continue;

      const sectionCandidates = Array.from(new Set([
        typeof control.list === 'number' ? control.list : 0,
        ...Array.from({ length: sectionCount }, (_, index) => index),
      ])).filter((sectionIndex) => sectionIndex >= 0 && sectionIndex < sectionCount);

      for (const sectionIndex of sectionCandidates) {
        try {
          const html = hwpDocument.exportControlHtml(
            sectionIndex,
            control.para,
            '[]',
            control.controlIndex,
          );
          const plan = parseMealTableHtml(html, file.name, fallbackYear);
          if (plan) return plan;
        } catch {
          // 다른 표나 중첩 컨트롤일 수 있으므로 다음 후보를 계속 검사한다.
        }
      }
    }
  } finally {
    hwpDocument.free();
  }

  throw new Error('날짜와 아침·점심·저녁이 포함된 주간 식단표를 찾지 못했습니다.');
}
