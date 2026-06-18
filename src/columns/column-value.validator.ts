import { BadRequestException } from '@nestjs/common';
import { ColumnType } from '../../generated/prisma/client';

/**
 * Validasi apakah `value` koheren untuk `type` kolom.
 * Dipanggil sebelum menyimpan ke DB — baik dari endpoint tulis (3e/3f) maupun import Excel (T5).
 *
 * Aturan:
 * - null / string kosong → selalu lolos (cell boleh kosong untuk semua tipe).
 * - TEXT   → string apa pun.
 * - INTEGER → pola bilangan bulat, boleh negatif. Contoh: "42", "-5".
 * - FLOAT  → bilangan desimal valid. Contoh: "3.14", "-1", "1e2".
 * - BOOLEAN → kanonik "true" atau "false" (case-sensitive).
 * - DATE   → format ISO YYYY-MM-DD dan tanggal valid. Contoh: "2024-08-17".
 * - URL    → URL http/https valid.
 * - MARKING → pass-through; TODO: definisikan token yang diizinkan saat ada kolomnya.
 */
export function validateValueForType(
  type: ColumnType,
  value: string | null,
  columnName: string,
): void {
  if (value === null || value === '') return;

  switch (type) {
    case ColumnType.TEXT:
      break;

    case ColumnType.INTEGER:
      if (!/^-?\d+$/.test(value)) {
        throw new BadRequestException(
          `Kolom "${columnName}": nilai "${value}" bukan bilangan bulat valid.`,
        );
      }
      break;

    case ColumnType.FLOAT:
      if (isNaN(Number(value)) || !isFinite(Number(value))) {
        throw new BadRequestException(
          `Kolom "${columnName}": nilai "${value}" bukan bilangan desimal valid.`,
        );
      }
      break;

    case ColumnType.BOOLEAN:
      if (value !== 'true' && value !== 'false') {
        throw new BadRequestException(
          `Kolom "${columnName}": nilai "${value}" bukan boolean valid (gunakan "true" atau "false").`,
        );
      }
      break;

    case ColumnType.DATE: {
      // Format wajib: YYYY-MM-DD (ISO 8601 date). Dipilih karena universal,
      // mudah diurutkan lexicografis, dan didukung standar tanpa ambiguitas zona waktu.
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(value) || isNaN(new Date(value).getTime())) {
        throw new BadRequestException(
          `Kolom "${columnName}": nilai "${value}" bukan tanggal valid (format: YYYY-MM-DD).`,
        );
      }
      break;
    }

    case ColumnType.URL:
      try {
        const url = new URL(value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          throw new Error();
        }
      } catch {
        throw new BadRequestException(
          `Kolom "${columnName}": nilai "${value}" bukan URL valid (harus dimulai dengan http:// atau https://).`,
        );
      }
      break;

    case ColumnType.MARKING:
      // TODO: DTPS tidak memakai MARKING; definisikan token saat ada kolomnya.
      break;
  }
}
