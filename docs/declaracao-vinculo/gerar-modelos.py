"""Gera os PDFs de referência e de revisão; não emite documentos oficiais.

Executar na raiz com Python e reportlab: python docs/declaracao-vinculo/gerar-modelos.py
"""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.platypus import Paragraph
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/pdf'
OUT.mkdir(parents=True, exist_ok=True)
WIDTH, HEIGHT = A4
pdfmetrics.registerFont(TTFont('Helvetica', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('Helvetica-Bold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
pdfmetrics.registerFontFamily('Helvetica', normal='Helvetica', bold='Helvetica-Bold')

# Reprodução visual da imagem restaurada, sem atribuir uma assinatura à escola.
c = canvas.Canvas(str(OUT / 'declaracao-vinculo-referencia.pdf'), pagesize=A4)
c.setTitle('Declaração de vínculo - referência visual alinhada')
c.setAuthor('ETE Conectada - reprodução de modelo fornecido pela equipe')
c.setSubject('Modelo sem assinatura; referência visual, não é uma declaração emitida.')
c.drawImage(str(OUT / 'declaracao-vinculo-alinhada.png'), 0, 0, width=WIDTH, height=HEIGHT, preserveAspectRatio=True, anchor='c')
c.showPage()
c.save()

# Proposta com texto selecionável e campos explícitos para a futura geração.
c = canvas.Canvas(str(OUT / 'declaracao-vinculo-modelo.pdf'), pagesize=A4)
c.setTitle('Declaração de vínculo - modelo para revisão da escola')
c.setAuthor('ETE Conectada')
c.setSubject('Proposta sem validade documental; campos e assinantes precisam de aprovação institucional.')
c.setFont('Helvetica', 8)
c.setFillColorRGB(.35, .35, .35)
c.drawRightString(WIDTH - 40, HEIGHT - 32, 'MODELO PARA REVISÃO - SEM VALIDADE DOCUMENTAL')
c.setFillColorRGB(0, 0, 0)
c.drawImage(str(ROOT / 'apps/portal/public/images/governo.png'), 36, HEIGHT - 172, width=148, height=148, preserveAspectRatio=True, mask='auto')
c.setFont('Helvetica-Bold', 11)
c.drawString(196, HEIGHT - 90, 'Secretaria de Educação')
c.setFont('Helvetica', 9)
c.drawString(196, HEIGHT - 110, 'Escola Técnica Estadual')
c.drawString(196, HEIGHT - 126, 'Advogado José David Gil Rodrigues')
c.drawRightString(WIDTH - 40, HEIGHT - 180, 'www.pe.gov.br')
c.setFont('Helvetica-Bold', 15)
c.drawCentredString(WIDTH / 2, HEIGHT - 235, 'DECLARAÇÃO DE VÍNCULO')
c.setLineWidth(.8)
c.line(WIDTH / 2 - 107, HEIGHT - 240, WIDTH / 2 + 107, HEIGHT - 240)

style = ParagraphStyle('body', fontName='Helvetica', fontSize=11.5, leading=24, alignment=TA_JUSTIFY)
body = (
    'Declaro, para os devidos fins de comprovação, que <b>[NOME COMPLETO]</b>, '
    'nascido(a) em <b>[DATA DE NASCIMENTO]</b>, natural de <b>[MUNICÍPIO/UF]</b>, '
    'filho(a) de <b>[FILIAÇÃO 1]</b> e <b>[FILIAÇÃO 2, QUANDO APLICÁVEL]</b>, '
    'portador(a) do CPF <b>[CPF, SE NECESSÁRIO À FINALIDADE]</b>, está regularmente '
    'matriculado(a) no <b>[ANO/SÉRIE]</b> do Ensino Médio Integrado ao Curso Técnico em '
    '<b>[CURSO]</b>, no período letivo <b>[PERÍODO LETIVO]</b>, nesta unidade escolar, '
    'de segunda-feira a sexta-feira, no horário das <b>[HORÁRIO INICIAL]</b> às '
    '<b>[HORÁRIO FINAL]</b>.<br/><br/>'
    'Frequência apurada: <b>[PERCENTUAL]%</b>, no intervalo <b>[PERÍODO DA APURAÇÃO]</b>. '
    'Incluir esta informação somente quando solicitada e comprovada nos registros escolares.'
)
paragraph = Paragraph(body, style)
_, body_height = paragraph.wrap(WIDTH - 80, HEIGHT)
paragraph.drawOn(c, 40, HEIGHT - 276 - body_height)
assert HEIGHT - 276 - body_height > 255, 'O texto invadiu o espaço das assinaturas.'
c.setFont('Helvetica', 9.5)
c.drawString(40, 278, 'Nome social, quando aplicável: [NOME SOCIAL]')
c.setFont('Helvetica', 11)
c.drawCentredString(WIDTH / 2, 242, 'Jaboatão dos Guararapes, [DIA] de [MÊS] de [ANO].')

for x, label in [(40, 'Chefe de Secretaria / Secretário(a) Escolar'), (WIDTH / 2 + 12, 'Gestor(a) / Diretor(a)')]:
    w = WIDTH / 2 - 52
    c.line(x, 190, x + w, 190)
    c.setFont('Helvetica', 8)
    c.drawCentredString(x + w / 2, 176, '[NOME COMPLETO DO(A) SIGNATÁRIO(A)]')
    c.drawCentredString(x + w / 2, 164, label)
    c.drawCentredString(x + w / 2, 152, '[MATRÍCULA / AUTORIZAÇÃO]')

c.setStrokeColorRGB(.6, .6, .6)
c.rect(40, 86, 48, 48)
c.setFont('Helvetica', 6.5)
c.drawCentredString(64, 113, 'Espaço para')
c.drawCentredString(64, 103, 'QR code')
c.setFont('Helvetica', 8)
c.drawString(101, 121, 'Validação: [ENDEREÇO INSTITUCIONAL DE VALIDAÇÃO]')
c.drawString(101, 108, 'Código: [CÓDIGO ALEATÓRIO DO DOCUMENTO]')
c.drawString(101, 95, 'Reservado para a futura emissão; este modelo não contém QR code funcional.')
c.setStrokeColorRGB(0, 0, 0)
c.setFont('Helvetica', 8)
c.drawString(40, 62, 'Escola Técnica Estadual Advogado José David Gil Rodrigues')
c.drawString(40, 48, 'BR 101 Sul, km 78, Jardim Jordão, Jaboatão dos Guararapes-PE.')
c.drawString(40, 34, 'Informações e Serviços: (81) 3181-2971')
c.showPage()
c.save()
print('PDFs gerados em', OUT)
