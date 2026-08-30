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

/** The heading levels the toolbar offers, and paragraph as the absence of one. */
const levels = [0, 1, 2, 3] as const;

const levelNames: Record<(typeof levels)[number], string> = {
  0: 'Paragraph',
  1: 'Heading 1',
  2: 'Heading 2',
  3: 'Heading 3',
};

/** The note body editor, with a formatting toolbar above it. */
export function RichTextEditor({ content, onChange, readOnly = false }: RichTextEditorProps) {
  // the link row, rather than window.prompt: a prompt blocks the browser, and
  // jsdom answers it with undefined, so the feature could not be tested at all
  const [linking, setLinking] = useState(false);
  const [href, setHref] = useState('');
  const [linkError, setLinkError] = useState(false);
  const [full, setFull] = useState(false);

  const editor = useEditor({
    // every mark and node here is one the API's sanitiser allows through. a
    // button writing a tag the server strips would lose the formatting on save
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
    selector: ({ editor: current }) => ({
      level: levels.find((level) => level > 0 && current?.isActive('heading', { level })) ?? 0,
      bold: current?.isActive('bold') ?? false,
      italic: current?.isActive('italic') ?? false,
      underline: current?.isActive('underline') ?? false,
      strike: current?.isActive('strike') ?? false,
      code: current?.isActive('code') ?? false,
      bulletList: current?.isActive('bulletList') ?? false,
      orderedList: current?.isActive('orderedList') ?? false,
      blockquote: current?.isActive('blockquote') ?? false,
      codeBlock: current?.isActive('codeBlock') ?? false,
      link: current?.isActive('link') ?? false,
      characters: current?.storage.characterCount.characters() ?? 0,
      words: current?.storage.characterCount.words() ?? 0,
      canUndo: current?.can().undo() ?? false,
      canRedo: current?.can().redo() ?? false,
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

  /** One toggle in the toolbar, pressed while its mark or block is active. */
  function tool(label: string, shortcut: string, on: boolean, run: () => void) {
    return (
      <button
        type="button"
        className="editor-tool"
        title={`${label} (${shortcut})`}
        aria-pressed={on}
        onClick={run}
      >
        {label}
      </button>
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

  return (
    <div className="editor">
      <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
        <select
          className="editor-style"
          aria-label="Text style"
          value={String(active.level)}
          onChange={(event) => {
            const level = Number(event.target.value);

            if (level === 0) {
              chain().setParagraph().run();
              return;
            }

            chain()
              .setHeading({ level: level as 1 | 2 | 3 })
              .run();
          }}
        >
          {levels.map((level) => (
            <option key={level} value={level}>
              {levelNames[level]}
            </option>
          ))}
        </select>

        <span className="editor-tool-divider" />

        {tool('Bold', 'Ctrl+B', active.bold, () => chain().toggleBold().run())}
        {tool('Italic', 'Ctrl+I', active.italic, () => chain().toggleItalic().run())}
        {tool('Underline', 'Ctrl+U', active.underline, () => chain().toggleUnderline().run())}
        {tool('Strike', 'Ctrl+Shift+S', active.strike, () => chain().toggleStrike().run())}
        {tool('Code', 'Ctrl+E', active.code, () => chain().toggleCode().run())}

        <span className="editor-tool-divider" />

        {tool('Bullet list', 'Ctrl+Shift+8', active.bulletList, () =>
          chain().toggleBulletList().run(),
        )}
        {tool('Numbered list', 'Ctrl+Shift+7', active.orderedList, () =>
          chain().toggleOrderedList().run(),
        )}
        {tool('Quote', 'Ctrl+Shift+B', active.blockquote, () => chain().toggleBlockquote().run())}
        {tool('Code block', 'Ctrl+Alt+C', active.codeBlock, () => chain().toggleCodeBlock().run())}

        <span className="editor-tool-divider" />

        <button
          type="button"
          className="editor-tool"
          title="Divider"
          onClick={() => chain().setHorizontalRule().run()}
        >
          Divider
        </button>

        <span className="editor-tool-divider" />

        <button
          type="button"
          className="editor-tool"
          title="Link (Ctrl+K)"
          aria-pressed={active.link}
          aria-expanded={linking}
          onClick={() => (linking ? closeLink() : openLink())}
        >
          Link
        </button>

        <span className="editor-tool-divider" />

        <button
          type="button"
          className="editor-tool"
          title="Undo (Ctrl+Z)"
          disabled={!active.canUndo}
          onClick={() => chain().undo().run()}
        >
          Undo
        </button>
        <button
          type="button"
          className="editor-tool"
          title="Redo (Ctrl+Shift+Z)"
          disabled={!active.canRedo}
          onClick={() => chain().redo().run()}
        >
          Redo
        </button>

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
            <button type="button" className="editor-tool" onClick={applyLink}>
              Apply
            </button>
            {active.link && (
              <button type="button" className="editor-tool" onClick={removeLink}>
                Remove link
              </button>
            )}
            <button type="button" className="editor-tool" onClick={closeLink}>
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
          {counted(active.words, 'word')}, {counted(active.characters, 'character')}
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
