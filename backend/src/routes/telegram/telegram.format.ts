const escapeHtml = (text: string): string =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const SAFE_LINK = /^(https?:\/\/|mailto:|tg:\/\/)/i;

const FENCE = /^\s*(```|~~~)\s*([\w+#.-]*)\s*$/;
const HEADING = /^\s*#{1,6}\s+(.*?)\s*#*\s*$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

function inline(line: string): string {
    const kept: string[] = [];
    const keep = (html: string) => `${kept.push(html) - 1}`;

    let out = line.replace(/`([^`\n]+)`/g, (_, code: string) =>
        keep(`<code>${escapeHtml(code)}</code>`),
    );

    out = out.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (whole, label: string, url: string) =>
        SAFE_LINK.test(url)
            ? keep(`<a href="${escapeHtml(url).replace(/"/g, '&quot;')}">${escapeHtml(label)}</a>`)
            : whole,
    );

    out = escapeHtml(out)
        .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<b>$1</b>')
        .replace(/(?<![\w_])__(?=\S)(.+?)(?<=\S)__(?![\w_])/g, '<b>$1</b>')
        .replace(/(?<![\w*])\*(?=[^\s*])([^*\n]+?)(?<=\S)\*(?![\w*])/g, '<i>$1</i>')
        .replace(/(?<![\w_])_(?=[^\s_])([^_\n]+?)(?<=\S)_(?![\w_])/g, '<i>$1</i>')
        .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '<s>$1</s>')
        .replace(/\|\|(?=\S)(.+?)(?<=\S)\|\|/g, '<tg-spoiler>$1</tg-spoiler>');

    return out.replace(/(\d+)/g, (_, index: string) => kept[Number(index)]);
}

export function telegramHtml(markdown: string): string {
    const lines = markdown.split('\n');
    const out: string[] = [];

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const fence = FENCE.exec(line);

        if (fence) {
            const body: string[] = [];

            for (i += 1; i < lines.length && !lines[i].trim().startsWith(fence[1]); i += 1) {
                body.push(lines[i]);
            }

            const code = escapeHtml(body.join('\n'));

            out.push(
                fence[2] === ''
                    ? `<pre>${code}</pre>`
                    : `<pre><code class="language-${fence[2]}">${code}</code></pre>`,
            );

            continue;
        }

        if (TABLE_ROW.test(line) && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1])) {
            const rows: string[] = [];

            for (; i < lines.length && TABLE_ROW.test(lines[i]); i += 1) {
                rows.push(lines[i].trim().replace(/\*\*|__|`/g, ''));
            }

            i -= 1;
            out.push(`<pre>${escapeHtml(rows.join('\n'))}</pre>`);

            continue;
        }

        if (QUOTE.test(line)) {
            const quoted: string[] = [];

            for (; i < lines.length && QUOTE.test(lines[i]); i += 1) {
                quoted.push(inline((QUOTE.exec(lines[i]) as RegExpExecArray)[1]));
            }

            i -= 1;
            out.push(`<blockquote>${quoted.join('\n')}</blockquote>`);

            continue;
        }

        const heading = HEADING.exec(line);

        if (heading) {
            out.push(`<b>${inline(heading[1].replace(/\*\*|__/g, ''))}</b>`);

            continue;
        }

        if (RULE.test(line)) {
            out.push('─'.repeat(line.trim().length));

            continue;
        }

        const bullet = BULLET.exec(line);

        out.push(bullet ? `${bullet[1]}• ${inline(bullet[2])}` : inline(line));
    }

    return out.join('\n');
}
