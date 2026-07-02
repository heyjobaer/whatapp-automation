import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import linkifyHtml from 'linkify-html';
import { parseMessageBody, type MessageNode } from '../../shared/utils/messageFormatter';

// Message bodies are untrusted user content: every text leaf is HTML-escaped before the
// formatting tags are assembled, so [innerHTML] only ever receives our own markup.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderNode(node: MessageNode): string {
  switch (node.type) {
    case 'text':
      return escapeHtml(node.value);
    case 'bold':
      return `<strong>${node.children.map(renderNode).join('')}</strong>`;
    case 'italic':
      return `<em>${node.children.map(renderNode).join('')}</em>`;
    case 'strike':
      return `<s>${node.children.map(renderNode).join('')}</s>`;
    case 'code':
      return `<code>${escapeHtml(node.value)}</code>`;
    case 'codeblock':
      return `<pre><code>${escapeHtml(node.value)}</code></pre>`;
  }
}

const LINKIFY_OPTIONS = {
  target: '_blank',
  rel: 'noopener noreferrer',
  defaultProtocol: 'https',
  ignoreTags: ['code', 'pre'],
};

/** WhatsApp text formatting (*bold* _italic_ ~strike~ `code`) + auto-linking (port of MessageBody.tsx). */
@Component({
  selector: 'app-message-body',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div [class]="className()" [innerHTML]="html()"></div>`,
})
export class MessageBodyComponent {
  readonly text = input.required<string>();
  readonly className = input<string>('');
  readonly enableLinks = input(true);

  readonly html = computed(() => {
    const rendered = parseMessageBody(this.text()).map(renderNode).join('');
    return this.enableLinks() ? linkifyHtml(rendered, LINKIFY_OPTIONS) : rendered;
  });
}
