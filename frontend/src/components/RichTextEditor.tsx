import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useState } from 'react';

export interface RichTextEditorProps {
  /** The HTML to show. Replaced in place when it changes. */
  content: string;
  onChange: (html: string) => void;
  /** Shows the note without letting it be changed, for a view-only share. */
  readOnly?: boolean;
}

/** The schemes the API's sanitiser keeps. A link written in anything else is dropped on save. */
const linkSchemes = ['http:', 'https:', 'mailto:'];

/**
 * What was typed as a URL worth storing, or null if it is not one.
 *
 * A bare domain gets https:// put in front of it, because that is what people
 * type and without it the browser reads it as a path on this site.
 */
function asHref(typed: string): string | null {
  const trimmed = typed.trim();

  if (trimmed === '') {
    return null;
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return linkSchemes.includes(new URL(withScheme).protocol) ? withScheme : null;
  } catch {
    return null;
  }
}

/** The most content the API stores in one note, in bytes. Past this a save is a 400. */
const contentLimitBytes = 1_000_000;

/** How full a note has to be before it is worth saying so. */
const warnAtBytes = contentLimitBytes * 0.9;

/**
 * Whether the note is close enough to the cap to warn about.
 *
 * Bytes rather than characters, because bytes are what the API counts. UTF-8
 * never needs more than three per JavaScript character, so anything short enough
 * is under the cap without being encoded to find out.
 */
function nearTheLimit(html: string): boolean {
  return html.length * 3 >= warnAtBytes && new TextEncoder().encode(html).length >= warnAtBytes;
}

/** "1 word" rather than "1 words". */
function counted(total: number, noun: string): string {
  return `${total.toLocaleString()} ${noun}${total === 1 ? '' : 's'}`;
}

// 24x24 stroke paths drawn at 18px, one string each so a button stays one
// element rather than becoming a component per icon
const paths = {
  bold: 'M6 4h8a4 4 0 0 1 0 8H6zM6 12h9a4 4 0 0 1 0 8H6z',
  italic: 'M19 4h-9M14 20H5M15 4L9 20',
  underline: 'M6 3v7a6 6 0 0 0 12 0V3M4 21h16',
  strike:
    'M4 12h16M7 7.5A3.5 3.5 0 0 1 10.5 4.5h3A3.5 3.5 0 0 1 17 7.5M7 15.5a3.5 3.5 0 0 0 3.5 4h3a3.5 3.5 0 0 0 3.5-3.5',
  bulletList: 'M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01',
  orderedList:
    'M10 6h11M10 12h11M10 18h11M4 5l1.5-.5V10M3.8 14.4c.3-.9 1.4-1.2 2.1-.7.7.5.6 1.4.1 1.9L3.8 19H6.2',
  // a quotation mark rather than a bar and some lines, which read as a third
  // kind of list beside the two real ones
  quote:
    'M9 5H6a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2a2 2 0 0 1-2 2H5M19 5h-3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2a2 2 0 0 1-2 2h-1',
  codeBlock: 'M16 18l5-6-5-6M8 6l-5 6 5 6',
  link: 'M15 7h3a5 5 0 0 1 0 10h-3M9 7H6a5 5 0 0 0 0 10h3M8 12h8',
} as const;

/**
 * What the toolbar offers, in the order it draws them.
 *
 * Deliberately shorter than what the sanitiser allows. Every mark the editor can
 * write still has its keyboard shortcut - inline code is Ctrl+E, undo is Ctrl+Z -
 * but a button earns its place in the row only if it gets reached for.
 */
type Control =
  | { kind: 'divider' }
  | { kind: 'tool'; label: Label; shortcut: string; icon?: keyof typeof paths; text?: string };

type Label =
  | 'Heading 1'
  | 'Heading 2'
  | 'Heading 3'
  | 'Bold'
  | 'Italic'
  | 'Underline'
  | 'Strikethrough'
  | 'Bullet list'
  | 'Numbered list'
  | 'Quote'
  | 'Code block'
  | 'Link';

const controls: Control[] = [
  { kind: 'tool', label: 'Heading 1', shortcut: 'Ctrl+Alt+1', text: 'H1' },
  { kind: 'tool', label: 'Heading 2', shortcut: 'Ctrl+Alt+2', text: 'H2' },
  { kind: 'tool', label: 'Heading 3', shortcut: 'Ctrl+Alt+3', text: 'H3' },
  { kind: 'divider' },
  { kind: 'tool', label: 'Bold', shortcut: 'Ctrl+B', icon: 'bold' },
  { kind: 'tool', label: 'Italic', shortcut: 'Ctrl+I', icon: 'italic' },
  { kind: 'tool', label: 'Underline', shortcut: 'Ctrl+U', icon: 'underline' },
  { kind: 'tool', label: 'Strikethrough', shortcut: 'Ctrl+Shift+S', icon: 'strike' },
  { kind: 'divider' },
  { kind: 'tool', label: 'Bullet list', shortcut: 'Ctrl+Shift+8', icon: 'bulletList' },
  { kind: 'tool', label: 'Numbered list', shortcut: 'Ctrl+Shift+7', icon: 'orderedList' },
  { kind: 'tool', label: 'Quote', shortcut: 'Ctrl+Shift+B', icon: 'quote' },
  { kind: 'tool', label: 'Code block', shortcut: 'Ctrl+Alt+C', icon: 'codeBlock' },
  { kind: 'divider' },
  { kind: 'tool', label: 'Link', shortcut: 'Ctrl+K', icon: 'link' },
];

/** The note body editor, with a formatting toolbar above it. */
export function RichTextEditor({ content, onChange, readOnly = false }: RichTextEditorProps) {
  // the link row, rather than window.prompt: a prompt blocks the browser, and
  // jsdom answers it with undefined, so the feature could not be tested at all
  const [linking, setLinking] = useState(false);
  const [href, setHref] = useState('');
  const [linkError, setLinkError] = useState(false);
  const [full, setFull] = useState(false);

  const editor = useEditor({
    // every mark and node the toolbar writes is one the API's sanitiser allows
    // through. a button writing a tag the server strips would lose its
    // formatting on save
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      CharacterCount,
      Placeholder.configure({ placeholder: 'Start writing...' }),
    ],
    content,
    editable: !readOnly,
    onUpdate: ({ editor: changed }) => {
      const html = changed.getHTML();

      setFull(nearTheLimit(html));
      onChange(html);
    },
  });

  // the permission arrives with the note, so the editor is built before it is
  // known and has to be told once it is. emitUpdate is off for the same reason
  // it is off above - an update here looks like the user typing, and autosave
  // would write the note straight back out again
  useEffect(() => {
    editor?.setEditable(!readOnly, false);
  }, [editor, readOnly]);

  // covers the first render and a switch to another note. typing is covered by
  // onUpdate, which already holds the html this would otherwise ask for again
  useEffect(() => {
    setFull(nearTheLimit(content));
  }, [content]);

  // switching to another note changes this prop without unmounting, and useEditor
  // only reads content once. without this the previous note's body stays on
  // screen and the next save writes it over the note now being shown.
  useEffect(() => {
    if (editor === null || content === editor.getHTML()) {
      return;
    }

    // emitUpdate would look like the user typing and mark the note dirty
    editor.commands.setContent(content, { emitUpdate: false });
  }, [editor, content]);

  const active = useEditorState({
    editor,
    selector: ({ editor: current }): Record<Label, boolean> => ({
      'Heading 1': current?.isActive('heading', { level: 1 }) ?? false,
      'Heading 2': current?.isActive('heading', { level: 2 }) ?? false,
      'Heading 3': current?.isActive('heading', { level: 3 }) ?? false,
      Bold: current?.isActive('bold') ?? false,
      Italic: current?.isActive('italic') ?? false,
      Underline: current?.isActive('underline') ?? false,
      Strikethrough: current?.isActive('strike') ?? false,
      'Bullet list': current?.isActive('bulletList') ?? false,
      'Numbered list': current?.isActive('orderedList') ?? false,
      Quote: current?.isActive('blockquote') ?? false,
      'Code block': current?.isActive('codeBlock') ?? false,
      Link: current?.isActive('link') ?? false,
    }),
  });

  const size = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      characters: current?.storage.characterCount.characters() ?? 0,
      words: current?.storage.characterCount.words() ?? 0,
    }),
  });

  if (editor === null) {
    return null;
  }

  if (readOnly) {
    return (
      <div className="editor">
        <EditorContent editor={editor} className="editor-body" />
      </div>
    );
  }

  const chain = () => editor.chain().focus();

  /** Opens the row with whatever link is already on the selection, if any. */
  function openLink() {
    setHref((editor.getAttributes('link').href as string | undefined) ?? '');
    setLinkError(false);
    setLinking(true);
  }

  function closeLink() {
    setLinking(false);
    setLinkError(false);
    setHref('');
  }

  function applyLink() {
    const url = asHref(href);

    if (url === null) {
      setLinkError(true);
      return;
    }

    // extendMarkRange so editing a link that is already there replaces the whole
    // of it rather than half
    chain().extendMarkRange('link').setLink({ href: url }).run();
    closeLink();
  }

  function removeLink() {
    chain().extendMarkRange('link').unsetLink().run();
    closeLink();
  }

  /** Runs whichever command the pressed control stands for. */
  function press(label: Label) {
    switch (label) {
      case 'Heading 1':
        return chain().toggleHeading({ level: 1 }).run();
      case 'Heading 2':
        return chain().toggleHeading({ level: 2 }).run();
      case 'Heading 3':
        return chain().toggleHeading({ level: 3 }).run();
      case 'Bold':
        return chain().toggleBold().run();
      case 'Italic':
        return chain().toggleItalic().run();
      case 'Underline':
        return chain().toggleUnderline().run();
      case 'Strikethrough':
        return chain().toggleStrike().run();
      case 'Bullet list':
        return chain().toggleBulletList().run();
      case 'Numbered list':
        return chain().toggleOrderedList().run();
      case 'Quote':
        return chain().toggleBlockquote().run();
      case 'Code block':
        return chain().toggleCodeBlock().run();
      default:
        return linking ? closeLink() : openLink();
    }
  }

  return (
    <div className="editor">
      <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
        {controls.map((control, index) =>
          control.kind === 'divider' ? (
            // the row is a fixed list, so its position is a stable identity
            <span key={`divider-${index}`} className="editor-tool-divider" />
          ) : (
            <button
              key={control.label}
              type="button"
              className="editor-tool"
              title={`${control.label} (${control.shortcut})`}
              aria-label={control.label}
              aria-pressed={active[control.label]}
              aria-expanded={control.label === 'Link' ? linking : undefined}
              onClick={() => press(control.label)}
            >
              {control.text === undefined && control.icon !== undefined ? (
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d={paths[control.icon]} />
                </svg>
              ) : (
                <span className="editor-tool-text">{control.text}</span>
              )}
            </button>
          ),
        )}

        {linking && (
          <div className="editor-link-row">
            <label className="visually-hidden" htmlFor="editor-link">
              Link address
            </label>
            <input
              id="editor-link"
              type="text"
              className="editor-link-input"
              value={href}
              placeholder="https://example.com"
              autoFocus
              aria-invalid={linkError}
              onChange={(event) => {
                setHref(event.target.value);
                setLinkError(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applyLink();
                }

                if (event.key === 'Escape') closeLink();
              }}
            />
            <button type="button" className="editor-link-action" onClick={applyLink}>
              Apply
            </button>
            {active.Link && (
              <button type="button" className="editor-link-action" onClick={removeLink}>
                Remove link
              </button>
            )}
            <button type="button" className="editor-link-action" onClick={closeLink}>
              Cancel
            </button>
            {linkError && (
              <span className="field-error" role="alert">
                That is not a web or email address.
              </span>
            )}
          </div>
        )}
      </div>

      <EditorContent editor={editor} className="editor-body" />

      <div className="editor-footer">
        <span className="muted">
          {counted(size.words, 'word')}, {counted(size.characters, 'character')}
        </span>

        {full && (
          <span className="editor-limit" role="status">
            This note is nearly as large as one note can be. Splitting it in two beats
            finding out on a failed save.
          </span>
        )}
      </div>
    </div>
  );
}
