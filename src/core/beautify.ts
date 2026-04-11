import path from 'node:path';

import { html as beautifyHtml, js as beautifyJavaScript } from 'js-beautify';

const JS_OPTIONS = {
  indent_size: 2,
  preserve_newlines: true,
};

const HTML_OPTIONS = {
  indent_size: 2,
  preserve_newlines: true,
};

export function beautifyFileContent(
  filePath: string,
  data: Buffer,
): Buffer {
  const extension = path.extname(filePath).toLowerCase();

  try {
    if (extension === '.json') {
      const parsed = JSON.parse(data.toString('utf8'));
      return Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    }

    if (extension === '.js') {
      return Buffer.from(
        beautifyJavaScript(data.toString('utf8').trim(), JS_OPTIONS),
        'utf8',
      );
    }

    if (extension === '.html') {
      return Buffer.from(
        beautifyHtml(data.toString('utf8').trim(), HTML_OPTIONS),
        'utf8',
      );
    }
  } catch {
    return data;
  }

  return data;
}
