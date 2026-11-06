import qrcode from 'qrcode-generator';
import { rgb, type PDFPage } from 'pdf-lib';
import {
  verificationLink,
  validDocumentCode,
} from './public-verification-input';
export type PdfVerification = { code: string; url: string };
export function qrPattern(value: PdfVerification) {
  let url: URL;
  try {
    url = new URL(value.url);
  } catch {
    throw new Error('Endereço de verificação inválido.');
  }
  if (
    !validDocumentCode(value.code) ||
    verificationLink(value.code, url.origin) !== value.url
  )
    throw new Error('Código e endereço de verificação não correspondem.');
  const qr = qrcode(0, 'M');
  qr.addData(value.url, 'Byte');
  qr.make();
  if (qr.getModuleCount() > 49)
    throw new Error('O QR excede o espaço de leitura do modelo.');
  return qr;
}
export function drawDeclarationQr(
  page: PDFPage,
  verification: PdfVerification,
  x: number,
  y: number,
  size: number,
) {
  const qr = qrPattern(verification),
    count = qr.getModuleCount(),
    quiet = 4,
    unit = size / (count + quiet * 2);
  page.drawRectangle({ x, y, width: size, height: size, color: rgb(1, 1, 1) });
  for (let row = 0; row < count; row++)
    for (let col = 0; col < count; col++)
      if (qr.isDark(row, col))
        page.drawRectangle({
          x: x + (col + quiet) * unit,
          y: y + (count + quiet - row - 1) * unit,
          width: unit,
          height: unit,
          color: rgb(0, 0, 0),
        });
}
