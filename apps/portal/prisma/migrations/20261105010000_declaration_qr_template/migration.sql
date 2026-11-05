-- Preserva os arquivos anteriores; aceita somente a nova versão explícita com QR.
ALTER TABLE declaration_pdf_archives DROP CONSTRAINT declaration_pdf_archives_template_check;
ALTER TABLE declaration_pdf_archives ADD CONSTRAINT declaration_pdf_archives_template_check
 CHECK(template_version::text IN ('minuta-a4-v1'::text,'minuta-a4-qr-v1'::text));
