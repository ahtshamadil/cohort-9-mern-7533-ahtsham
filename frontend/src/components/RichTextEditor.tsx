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

  const editor = useEditor({
    // every mark and node here is one the API's sanitiser allows through. a
    // button writing a tag the server strips would lose the formatting on save
    extensions: [StarterKit.configure({ link: { openOnClick: false } })],
    content,
    editable: !readOnly,
    onUpdate: ({ editor: changed }) => {
      onChange(changed.getHTML());
    },
  });

  // the permission arrives with the note, so the editor is built before it is
  // known and has to be told once it is. emitUpdate is off for the same reason
  // it is off above - an update here looks like the user typing, and autosave
  // would write the note straight back out again
  useEffect(() => {
    editor?.setEditable(!readOnly, false);
  }, [editor, readOnly]);

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
    </div>
  );
}
