'use client';

export async function downloadDeclaration(
  response: Response,
  filename = 'declaracao-para-conferencia.pdf',
) {
  if (!response.ok) {
    const result = await response.json();
    throw new Error(
      result.error || 'Não foi possível baixar o PDF. Tente novamente.',
    );
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // O navegador precisa terminar de consumir o blob antes da revogação.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
