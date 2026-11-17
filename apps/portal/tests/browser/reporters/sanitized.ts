import type {
  Reporter,
  TestCase,
  TestResult,
  TestError,
} from '@playwright/test/reporter';

export default class SanitizedReporter implements Reporter {
  onBegin(_config: unknown, suite: { allTests(): TestCase[] }) {
    console.log(`EC-039: ${suite.allTests().length} testes de navegador.`);
  }

  onStdErr(chunk: string | Buffer) {
    const message =
      'Laboratório interrompido: atualize o Next.js antes de repetir a validação.';
    if (chunk.toString().includes(message)) console.error(message);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    console.log(
      `${result.status === 'passed' ? 'OK' : result.status.toUpperCase()}: ${test.title}`,
    );
    // Diagnóstico estrutural gerado pelo teste, sem texto/campos da página.
    for (const annotation of test.annotations.filter(
      (item) => item.type === 'reflow',
    ))
      console.log(`[reflow] ${annotation.description}`);
    if (result.status === 'failed' || result.status === 'timedOut') {
      const stack = result.errors.map((error) => error.stack ?? '').join('\n');
      const location = stack.match(
        /apps\/portal\/tests\/(?:academic-browser|browser)\/[^\s():]+:\d+:\d+/,
      )?.[0];
      console.error(
        `Falha em ${location ?? 'local não identificado'} (detalhes omitidos para não expor dados do teste).`,
      );
    }
  }

  onError(error: TestError) {
    const location = error.stack?.match(
      /apps\/portal\/tests\/(?:academic-browser|browser)\/[^\s():]+:\d+:\d+/,
    )?.[0];
    console.error(
      `Falha de configuração em ${location ?? 'local não identificado'} (detalhes omitidos).`,
    );
  }

  onEnd(result: { status: string }) {
    console.log(`EC-039 terminou: ${result.status}.`);
  }
}
