import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';
import { ChangeAction, ColumnType } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Internal types untuk parsed data (sebelum menulis ke DB)
// ---------------------------------------------------------------------------

interface ColDef {
  colIndex: number;
  name: string;
  type: ColumnType;
  isGroup: boolean;
  parentColIndex?: number;
  orderIndex: number;
}

interface ParsedCell { colIndex: number; value: string }

interface DtpsSheetData {
  kind: 'dtps';
  worksheetName: string;
  colDefs: ColDef[];
  dataRows: ParsedCell[][];
}

interface GridSheetData {
  kind: 'grid';
  worksheetName: string;
  firstRow: number; lastRow: number;
  firstCol: number; lastCol: number;
  cells: Array<{ rowNum: number; colNum: number; value: string }>;
  merges: Array<{ startRow: number; endRow: number; startCol: number; endCol: number }>;
}

type SheetData = DtpsSheetData | GridSheetData;

// ---------------------------------------------------------------------------
// Konstanta parse DTPS
// ---------------------------------------------------------------------------

const DTPS_MAIN_HEADER_ROW = 2;
const DTPS_SUB_HEADER_ROW = 3;
const DTPS_DATA_START_ROW = 4;

// ---------------------------------------------------------------------------
// Pure helper functions
// ---------------------------------------------------------------------------

function colLetterToNum(letters: string): number {
  return letters.toUpperCase().split('').reduce((acc, c) => acc * 26 + c.charCodeAt(0) - 64, 0);
}

function colNumToLetter(n: number): string {
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

/**
 * Ambil teks tampilan dari cell ExcelJS.
 * Memakai `.text` (bukan `.value`) agar format dipertahankan —
 * khususnya NIDN "0017026012" yang disimpan dengan nol di depan.
 * Untuk cell formula: `.text` mengembalikan nilai cached (hasil kalkulasi).
 */
function getCellText(cell: ExcelJS.Cell): string {
  if (
    !cell ||
    cell.type === ExcelJS.ValueType.Null ||
    cell.type === ExcelJS.ValueType.Merge
  ) return '';
  const text = cell.text;
  if (text !== null && text !== undefined && String(text).trim() !== '') {
    return String(text).trim();
  }
  if (cell.value === null || cell.value === undefined) return '';
  return String(cell.value).trim();
}

function getCellUrl(cell: ExcelJS.Cell): string {
  if (
    !cell ||
    cell.type === ExcelJS.ValueType.Null ||
    cell.type === ExcelJS.ValueType.Merge
  ) return '';
  const hl = cell.hyperlink as string | { hyperlink: string } | undefined;
  if (hl) {
    if (typeof hl === 'string') return hl.trim();
    if (typeof hl === 'object' && hl.hyperlink) return hl.hyperlink.trim();
  }
  return getCellText(cell);
}

function inferColumnType(name: string): ColumnType {
  const n = name.toLowerCase().trim();
  if (n === 'no.' || n === 'no') return ColumnType.INTEGER;
  if (n.includes('link') || n.includes('url') || n.includes('dokumen')) return ColumnType.URL;
  return ColumnType.TEXT;
}

/** Sheet yang dilewati: daftar isi workbook, bukan data. */
function isDaftarSheet(name: string): boolean {
  return name.toLowerCase().includes('daftar sheet') ||
         name.toLowerCase().includes('daftar isi');
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ImportsService {
  constructor(private readonly prisma: PrismaService) {}

  async importWorkbook(
    file: Express.Multer.File,
    userId: string,
    name?: string,
    parentMenuId?: string,
  ) {
    // 1. Validasi parentMenuId
    if (parentMenuId) {
      const parent = await this.prisma.menuItem.findUnique({
        where: { id: parentMenuId },
        select: { id: true },
      });
      if (!parent) throw new NotFoundException('Node induk tidak ditemukan');
    }

    // 2. Parse Excel di memori (sebelum transaksi)
    const workbook = new ExcelJS.Workbook();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await workbook.xlsx.load(file.buffer as any);
    } catch {
      throw new UnprocessableEntityException(
        'File Excel tidak valid atau rusak.',
      );
    }

    // 3. Parse setiap worksheet (murni data, belum ke DB)
    const sheetsToProcess: SheetData[] = [];

    for (const ws of workbook.worksheets) {
      if (isDaftarSheet(ws.name)) continue;

      if (ws.name.toLowerCase().includes('data dosen tetap')) {
        const colDefs = this.parseDtpsHeaders(ws);
        if (colDefs.length === 0) continue;
        const dataRows = this.parseDtpsDataRows(ws, colDefs);
        sheetsToProcess.push({
          kind: 'dtps',
          worksheetName: ws.name,
          colDefs,
          dataRows,
        });
      } else {
        const grid = this.parseGridSheet(ws);
        if (grid) sheetsToProcess.push(grid);
      }
    }

    if (sheetsToProcess.length === 0) {
      throw new UnprocessableEntityException(
        'Tidak ada worksheet yang dapat di-parse dari file ini.',
      );
    }

    // 4. Seluruh penulisan DB dalam satu transaksi
    const workbookName = name?.trim() || file.originalname.replace(/\.xlsx$/i, '');

    return this.prisma.$transaction(
      async (tx) => {
        // ExcelImport
        const excelImport = await tx.excelImport.create({
          data: {
            uploadedById: userId,
            originalFilename: file.originalname,
            storagePath: 'not-persisted', // Sprint 2: simpan ke object storage
            status: 'PARSED',
          },
          select: { id: true },
        });

        // MenuItem workbook
        const wbAgg = await tx.menuItem.aggregate({
          where: { parentId: parentMenuId ?? null },
          _max: { orderIndex: true },
        });
        const wbMenu = await tx.menuItem.create({
          data: {
            name: workbookName,
            parentId: parentMenuId ?? null,
            orderIndex: (wbAgg._max.orderIndex ?? 0) + 1,
          },
          select: { id: true },
        });

        const createdSheets: Array<{
          sheetId: string;
          name: string;
          isReadOnly: boolean;
        }> = [];

        for (let i = 0; i < sheetsToProcess.length; i++) {
          const sheetData = sheetsToProcess[i];
          const isReadOnly = sheetData.kind !== 'dtps';

          // MenuItem sheet (anak workbook)
          const sheetMenu = await tx.menuItem.create({
            data: {
              name: sheetData.worksheetName,
              parentId: wbMenu.id,
              orderIndex: i + 1,
            },
            select: { id: true },
          });

          // Sheet
          const sheet = await tx.sheet.create({
            data: {
              menuItemId: sheetMenu.id,
              sourceImportId: excelImport.id,
              name: sheetData.worksheetName,
              orderIndex: i + 1,
              isReadOnly,
            },
            select: { id: true },
          });

          if (sheetData.kind === 'dtps') {
            await this.writeDtpsToTx(tx, sheet.id, sheetData);
          } else {
            await this.writeGridToTx(tx, sheet.id, sheetData);
          }

          createdSheets.push({
            sheetId: sheet.id,
            name: sheetData.worksheetName,
            isReadOnly,
          });
        }

        // Audit
        await tx.changeLog.create({
          data: {
            userId,
            entityType: 'ExcelImport',
            entityId: excelImport.id,
            action: ChangeAction.CREATE,
            afterData: {
              workbookMenuId: wbMenu.id,
              sheetCount: createdSheets.length,
              sheets: createdSheets.map((s) => s.name),
            },
          },
        });

        return {
          importId: excelImport.id,
          workbookMenuId: wbMenu.id,
          sheets: createdSheets,
        };
      },
      { timeout: 120_000 }, // file besar dengan banyak sheet butuh waktu lebih
    );
  }

  // ---------------------------------------------------------------------------
  // DTPS — parse header (semantic)
  // ---------------------------------------------------------------------------

  private parseDtpsHeaders(worksheet: ExcelJS.Worksheet): ColDef[] {
    const mergeMap = new Map<number, number>(); // startCol → endCol (hanya MAIN_HEADER_ROW)
    for (const merge of worksheet.model.merges || []) {
      const [s, e] = merge.split(':');
      const sm = s.match(/^([A-Z]+)(\d+)$/);
      const em = e.match(/^([A-Z]+)(\d+)$/);
      if (!sm || !em) continue;
      if (parseInt(sm[2]) !== DTPS_MAIN_HEADER_ROW) continue;
      mergeMap.set(colLetterToNum(sm[1]), colLetterToNum(em[1]));
    }

    const mainRow = worksheet.getRow(DTPS_MAIN_HEADER_ROW);
    const subRow = worksheet.getRow(DTPS_SUB_HEADER_ROW);
    const colDefs: ColDef[] = [];
    let topOrder = 0;

    let lastCol = 1;
    mainRow.eachCell({ includeEmpty: false }, (_, c) => { if (c > lastCol) lastCol = c; });

    for (let colIdx = 1; colIdx <= lastCol; colIdx++) {
      const cell = mainRow.getCell(colIdx);
      if (cell.type === ExcelJS.ValueType.Merge) continue;
      const val = getCellText(cell);
      if (!val) continue;

      const mergeEnd = mergeMap.get(colIdx);
      if (mergeEnd !== undefined) {
        topOrder++;
        colDefs.push({
          colIndex: colIdx, name: val, type: ColumnType.TEXT,
          isGroup: true, orderIndex: topOrder,
        });
        let childOrder = 0;
        for (let sub = colIdx; sub <= mergeEnd; sub++) {
          const sc = subRow.getCell(sub);
          if (sc.type === ExcelJS.ValueType.Merge) continue;
          const sv = getCellText(sc);
          if (!sv) continue;
          childOrder++;
          colDefs.push({
            colIndex: sub, name: sv, type: inferColumnType(sv),
            isGroup: false, parentColIndex: colIdx, orderIndex: childOrder,
          });
        }
      } else {
        topOrder++;
        colDefs.push({
          colIndex: colIdx, name: val, type: inferColumnType(val),
          isGroup: false, orderIndex: topOrder,
        });
      }
    }
    return colDefs;
  }

  private parseDtpsDataRows(
    worksheet: ExcelJS.Worksheet,
    colDefs: ColDef[],
  ): ParsedCell[][] {
    const leafCols = colDefs.filter((c) => !c.isGroup);
    const keyColIndices = leafCols.filter((c) => c.parentColIndex === undefined).slice(0, 2).map((c) => c.colIndex);
    const result: ParsedCell[][] = [];
    let rowNum = DTPS_DATA_START_ROW;
    while (true) {
      const exRow = worksheet.getRow(rowNum);
      if (keyColIndices.every((ci) => !getCellText(exRow.getCell(ci)))) break;
      const cells: ParsedCell[] = [];
      for (const col of leafCols) {
        const cell = exRow.getCell(col.colIndex);
        const value = col.type === ColumnType.URL ? getCellUrl(cell) : getCellText(cell);
        if (value) cells.push({ colIndex: col.colIndex, value });
      }
      result.push(cells);
      rowNum++;
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Grid mirror — parse (posisional, read-only)
  // ---------------------------------------------------------------------------

  private parseGridSheet(worksheet: ExcelJS.Worksheet): GridSheetData | null {
    let firstRow = Infinity, lastRow = 0, firstCol = Infinity, lastCol = 0;
    worksheet.eachRow({ includeEmpty: false }, (row, rn) => {
      firstRow = Math.min(firstRow, rn);
      lastRow = Math.max(lastRow, rn);
      row.eachCell({ includeEmpty: false }, (_, cn) => {
        firstCol = Math.min(firstCol, cn);
        lastCol = Math.max(lastCol, cn);
      });
    });
    if (lastRow === 0) return null;

    const cells: GridSheetData['cells'] = [];
    for (let r = firstRow; r <= lastRow; r++) {
      const row = worksheet.getRow(r);
      for (let c = firstCol; c <= lastCol; c++) {
        const cell = row.getCell(c);
        if (cell.type === ExcelJS.ValueType.Null || cell.type === ExcelJS.ValueType.Merge) continue;
        const value = getCellText(cell);
        if (value) cells.push({ rowNum: r, colNum: c, value });
      }
    }

    const merges: GridSheetData['merges'] = [];
    for (const merge of worksheet.model.merges || []) {
      const [s, e] = merge.split(':');
      const sm = s.match(/^([A-Z]+)(\d+)$/);
      const em = e.match(/^([A-Z]+)(\d+)$/);
      if (!sm || !em) continue;
      merges.push({
        startRow: parseInt(sm[2]), endRow: parseInt(em[2]),
        startCol: colLetterToNum(sm[1]), endCol: colLetterToNum(em[1]),
      });
    }

    return {
      kind: 'grid',
      worksheetName: worksheet.name,
      firstRow: firstRow === Infinity ? 1 : firstRow,
      lastRow,
      firstCol: firstCol === Infinity ? 1 : firstCol,
      lastCol,
      cells,
      merges,
    };
  }

  // ---------------------------------------------------------------------------
  // Tulis DTPS semantik ke DB (dalam transaksi)
  // ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async writeDtpsToTx(tx: any, sheetId: string, data: DtpsSheetData) {
    const { colDefs, dataRows } = data;

    // Dua map terpisah mencegah colIndex bentrok:
    // "Kualifikasi Akademik" (grup, colIndex=3) dan "Magister" (anak, juga colIndex=3)
    // berbagi colIndex yang sama. Jika satu Map dipakai, ID grup ditimpa ID Magister →
    // Doktor mendapat parentId salah (Magister, bukan Kualifikasi Akademik).
    const groupColIdMap = new Map<number, string>(); // colIndex → DB id (hanya node grup)
    const leafColIdMap  = new Map<number, string>(); // colIndex → DB id (hanya kolom daun)

    // Kolom — pass 1: top-level (grup + daun tanpa parent)
    for (const col of colDefs) {
      if (col.parentColIndex !== undefined) continue;
      const dbCol = await tx.column.create({
        data: { sheetId, name: col.name, type: col.type, orderIndex: col.orderIndex, parentColumnId: null },
        select: { id: true },
      });
      if (col.isGroup) {
        groupColIdMap.set(col.colIndex, dbCol.id);
      } else {
        leafColIdMap.set(col.colIndex, dbCol.id);
      }
    }

    // Kolom — pass 2: anak (parentId selalu dari groupColIdMap)
    for (const col of colDefs) {
      if (col.parentColIndex === undefined) continue;
      const parentId = groupColIdMap.get(col.parentColIndex);
      if (!parentId) continue;
      const dbCol = await tx.column.create({
        data: { sheetId, name: col.name, type: col.type, orderIndex: col.orderIndex, parentColumnId: parentId },
        select: { id: true },
      });
      leafColIdMap.set(col.colIndex, dbCol.id);
    }

    // Baris + cell (batch) — cell hanya pada kolom daun
    const rowInserts = dataRows.map((_, i) => ({ id: randomUUID(), sheetId, orderIndex: i + 1 }));
    if (rowInserts.length > 0) await tx.row.createMany({ data: rowInserts });

    const cellInserts: Array<{ rowId: string; columnId: string; value: string }> = [];
    for (let i = 0; i < dataRows.length; i++) {
      const rowId = rowInserts[i].id;
      for (const cell of dataRows[i]) {
        const columnId = leafColIdMap.get(cell.colIndex);
        if (columnId) cellInserts.push({ rowId, columnId, value: cell.value });
      }
    }
    if (cellInserts.length > 0) await tx.cell.createMany({ data: cellInserts });
  }

  // ---------------------------------------------------------------------------
  // Tulis grid mirror ke DB (dalam transaksi)
  // ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async writeGridToTx(tx: any, sheetId: string, data: GridSheetData) {
    const { firstRow, lastRow, firstCol, lastCol, cells, merges } = data;

    // Kolom posisional (batch): name = huruf Excel (A, B, C…)
    const colIdMap = new Map<number, string>();
    const colInserts = [];
    for (let c = firstCol; c <= lastCol; c++) {
      const id = randomUUID();
      colIdMap.set(c, id);
      colInserts.push({
        id, sheetId,
        name: colNumToLetter(c),
        type: ColumnType.TEXT,
        orderIndex: c - firstCol + 1,
        parentColumnId: null,
      });
    }
    if (colInserts.length > 0) await tx.column.createMany({ data: colInserts });

    // Baris (batch)
    const rowIdMap = new Map<number, string>();
    const rowInserts = [];
    for (let r = firstRow; r <= lastRow; r++) {
      const id = randomUUID();
      rowIdMap.set(r, id);
      rowInserts.push({ id, sheetId, orderIndex: r - firstRow + 1 });
    }
    if (rowInserts.length > 0) await tx.row.createMany({ data: rowInserts });

    // Cell (batch)
    const cellInserts = cells
      .map((c) => ({
        rowId: rowIdMap.get(c.rowNum)!,
        columnId: colIdMap.get(c.colNum)!,
        value: c.value,
      }))
      .filter((c) => c.rowId && c.columnId);
    if (cellInserts.length > 0) await tx.cell.createMany({ data: cellInserts });

    // CellMerge (batch) — representasi visual merge untuk frontend
    if (merges.length > 0) {
      await tx.cellMerge.createMany({
        data: merges.map((m) => ({ sheetId, ...m })),
      });
    }
  }
}
