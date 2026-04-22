import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface MarkdownProps {
  content: string;
}

marked.setOptions({
  gfm: true,
  breaks: true,
});

// Open external links in a new tab with safe rel attributes.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer nofollow');
  }
});

export default function Markdown({ content }: MarkdownProps) {
  const html = useMemo(() => {
    const rawHtml = marked.parse(content ?? '', { async: false }) as string;
    return DOMPurify.sanitize(rawHtml, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['style', 'iframe', 'form', 'input', 'script'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'style'],
    });
  }, [content]);

  return (
    <div
      className="prose-chat"
      // eslint-disable-next-line react/no-danger -- sanitized by DOMPurify above
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
