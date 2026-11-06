import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { drawDeclarationQr, type PdfVerification } from './declaration-qr';
import {
  declarationBody,
  DeclarationValidationError,
  type DeclarationStudent,
  type DeclarationFields,
} from './declarations';

let assets: Promise<Buffer[]> | undefined;
function loadAssets() {
  assets ??= Promise.all([
    readFile(path.join(process.cwd(), 'src/assets/fonts/DejaVuSans.ttf')),
    readFile(path.join(process.cwd(), 'src/assets/fonts/DejaVuSans-Bold.ttf')),
    // A imagem fornecida tem extensão .png, mas seus bytes são WebP.
    readFile(path.join(process.cwd(), 'public/images/governo.png')).then(
      (bytes) => sharp(bytes).png().toBuffer(),
    ),
  ]).catch((error) => {
    assets = undefined;
    throw error;
  });
  return assets;
}

function lines(text: string, font: PDFFont, size: number, width: number) {
  const result: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    // Quebra também nomes/identificadores excepcionalmente longos.
    const parts: string[] = [];
    let part = '';
    for (const character of word) {
      if (part && font.widthOfTextAtSize(part + character, size) > width) {
        parts.push(part);
        part = '';
      }
      part += character;
    }
    if (part) parts.push(part);
    for (const piece of parts) {
      const next = current ? `${current} ${piece}` : piece;
      if (current && font.widthOfTextAtSize(next, size) > width) {
        result.push(current);
        current = piece;
      } else current = next;
    }
  }
  if (current) result.push(current);
  return result;
}

function centered(
  page: PDFPage,
  text: string,
  y: number,
  font: PDFFont,
  size: number,
  x = 297.64,
) {
  page.drawText(text, {
    x: x - font.widthOfTextAtSize(text, size) / 2,
    y,
    font,
    size,
  });
}

// Modelos de teste sem assinatura; QR opcional na emissão individual registrada.
export async function createDeclarationPdf(
  student: DeclarationStudent,
  fields: DeclarationFields,
  verification?: PdfVerification,
) {
  return createDeclarationsPdf([{ student, fields, verification }]);
}

export async function createDeclarationsPdf(
  items: {
    student: DeclarationStudent;
    fields: DeclarationFields;
    verification?: PdfVerification;
  }[],
) {
  if (!items.length || items.length > 100)
    throw new DeclarationValidationError(
      'Selecione de 1 a 100 declarações por PDF.',
    );
  const bodies = items.map((item, index) => {
    try {
      return declarationBody(item.student, item.fields);
    } catch (error) {
      if (error instanceof DeclarationValidationError) error.itemIndex = index;
      throw error;
    }
  });
  const [regular, bold, government] = await loadAssets();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(regular, { subset: true });
  const heading = await pdf.embedFont(bold, { subset: true });
  const logo = await pdf.embedPng(government);
  const margin = 45;
  const width = 505.28;
  pdf.setTitle(
    items.some((item) => item.verification)
      ? 'Declaração de vínculo - documento de teste'
      : 'Declaração de vínculo - minuta para revisão',
  );
  pdf.setAuthor('ETE Conectada');
  pdf.setSubject(
    'Minuta não assinada; modelo sujeito à validação da escola/GRE.',
  );
  for (let index = 0; index < items.length; index++) {
    const fields = items[index].fields;
    const body = bodies[index];
    const page = pdf.addPage([595.28, 841.89]);
    try {
      page.drawText(
        items[index].verification
          ? 'DOCUMENTO DE TESTE - SEM VALIDADE OFICIAL'
          : 'MINUTA PARA REVISÃO - NÃO É DOCUMENTO EMITIDO',
        {
          x: margin,
          y: 807,
          size: 8,
          font,
          color: rgb(0.35, 0.35, 0.35),
        },
      );
      page.drawImage(logo, { x: 35, y: 641, width: 145, height: 145 });
      page.drawText('Secretaria de Educação', {
        x: 190,
        y: 742,
        size: 11,
        font: heading,
      });
      page.drawText('Escola Técnica Estadual', {
        x: 190,
        y: 721,
        size: 10,
        font,
      });
      page.drawText('Advogado José David Gil Rodrigues', {
        x: 190,
        y: 704,
        size: 10,
        font,
      });
      page.drawText('www.pe.gov.br', { x: 467, y: 647, size: 9, font });
      centered(page, 'DECLARAÇÃO DE VÍNCULO', 602, heading, 15);
      const socialLines = fields.socialName
        ? lines(`Nome social: ${fields.socialName}`, heading, 11, width)
        : [];
      socialLines.forEach((line, index) =>
        page.drawText(line, {
          x: margin,
          y: 553 - index * 18,
          size: 11,
          font: heading,
        }),
      );
      const bodyStart =
        553 - socialLines.length * 18 - (socialLines.length ? 9 : 0);
      const layout = [
        { size: 11, leading: 21 },
        { size: 10.5, leading: 19 },
        { size: 10, leading: 17.5 },
      ]
        .map((option) => ({
          ...option,
          rows: lines(body, font, option.size, width),
        }))
        .find(
          (option) =>
            bodyStart - (option.rows.length - 1) * option.leading >= 280,
        );
      if (!layout)
        throw new DeclarationValidationError(
          'O conteúdo excede uma página A4. Confira os campos; o modelo precisa ser ajustado para preservar os dados completos e as assinaturas.',
        );
      for (let i = 0; i < layout.rows.length; i++)
        page.drawText(layout.rows[i], {
          x: margin,
          y: bodyStart - i * layout.leading,
          size: layout.size,
          font,
        });
      const date = new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: 'America/Recife',
      }).format(new Date());
      centered(page, `Jaboatão dos Guararapes, ${date}.`, 250, font, 10);
      const signatures = [
        {
          x: 45,
          name: fields.secretaryName,
          role: 'Secretário(a) Escolar',
          registration: fields.secretaryRegistration,
        },
        {
          x: 315,
          name: fields.directorName,
          role: 'Gestor(a) / Diretor(a)',
          registration: fields.directorRegistration,
        },
      ];
      for (const signature of signatures) {
        page.drawLine({
          start: { x: signature.x, y: 214 },
          end: { x: signature.x + 235, y: 214 },
          thickness: 0.7,
        });
        const nameLines = lines(
          signature.name || 'Nome e carimbo do(a) responsável',
          font,
          8,
          235,
        );
        if (nameLines.length > 4)
          throw new DeclarationValidationError(
            'O nome completo do signatário não cabe no espaço. É necessário ajustar o modelo, sem abreviar o nome.',
          );
        nameLines.forEach((line, index) =>
          centered(page, line, 201 - index * 10, font, 8, signature.x + 117.5),
        );
        centered(page, signature.role, 151, heading, 8, signature.x + 117.5);
        if (signature.registration)
          centered(
            page,
            signature.registration,
            140,
            font,
            7,
            signature.x + 117.5,
          );
      }
      const verification = items[index].verification;
      if (verification) {
        if (font.widthOfTextAtSize(verification.url, 6) > 439)
          throw new DeclarationValidationError(
            'O endereço de verificação não cabe no modelo. Configure um endereço mais curto.',
          );
        drawDeclarationQr(page, verification, margin, 84, 54);
        page.drawText('Verificação de teste:', {
          x: 111,
          y: 125,
          font,
          size: 7,
        });
        page.drawText(verification.url, { x: 111, y: 113, font, size: 6 });
        page.drawText('Código: ' + verification.code, {
          x: 111,
          y: 101,
          font,
          size: 7,
        });
        page.drawText('Consulte a situação atual. Sem validade oficial.', {
          x: 111,
          y: 89,
          font,
          size: 7,
        });
      } else {
        // A preparação antiga mantém a reserva visual, sem promover minutas.
        page.drawRectangle({
          x: margin,
          y: 86,
          width: 42,
          height: 42,
          borderWidth: 0.6,
          borderColor: rgb(0.6, 0.6, 0.6),
        });
        centered(page, 'Espaço para', 111, font, 5.5, margin + 21);
        centered(page, 'QR code', 101, font, 5.5, margin + 21);
        page.drawText('Validação: endereço institucional a definir', {
          x: 99,
          y: 116,
          font,
          size: 7,
        });
        page.drawText('Código: reservado para a futura emissão', {
          x: 99,
          y: 103,
          font,
          size: 7,
        });
        page.drawText('Minuta sem QR code funcional e sem assinatura.', {
          x: 99,
          y: 90,
          font,
          size: 7,
        });
      }
      page.drawLine({
        start: { x: margin, y: 80 },
        end: { x: 550, y: 80 },
        thickness: 0.5,
        color: rgb(0.6, 0.6, 0.6),
      });
      page.drawText(
        'Escola Técnica Estadual Advogado José David Gil Rodrigues',
        { x: margin, y: 65, font, size: 8 },
      );
      page.drawText(
        'BR 101 Sul, km 78, Jardim Jordão, Jaboatão dos Guararapes-PE.',
        { x: margin, y: 51, font, size: 8 },
      );
      page.drawText('Informações e Serviços: (81) 3181-2971', {
        x: margin,
        y: 37,
        font,
        size: 8,
      });
      if (items.length > 1)
        page.drawText(`${index + 1} / ${items.length}`, {
          x: 515,
          y: 20,
          font,
          size: 7,
        });
    } catch (error) {
      if (error instanceof DeclarationValidationError) error.itemIndex = index;
      throw error;
    }
  }
  return pdf.save();
}
