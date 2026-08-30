import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect } from 'react';

export interface RichTextEditorProps {
  /** The HTML to show. Replaced in place when it changes. */
  content: string;
  onChange: (html: string) => void;
  /** Shows the note without letting it be changed, for a view-only share. */
  readOnly?: boolean;
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
      </div>

      <EditorContent editor={editor} className="editor-body" />
    </div>
  );
}
