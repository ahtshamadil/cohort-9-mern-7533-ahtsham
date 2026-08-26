import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { useEffect } from 'react';
import StarterKit from '@tiptap/starter-kit';

export interface RichTextEditorProps {
  /** The HTML to show. Replaced in place when it changes. */
  content: string;
  onChange: (html: string) => void;
  /** Shows the note without letting it be changed, for a view-only share. */
  readOnly?: boolean;
}

/** The note body editor, with a small formatting toolbar above it. */
export function RichTextEditor({ content, onChange, readOnly = false }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit],
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
      bold: current?.isActive('bold') ?? false,
      italic: current?.isActive('italic') ?? false,
      heading: current?.isActive('heading', { level: 2 }) ?? false,
      bulletList: current?.isActive('bulletList') ?? false,
      orderedList: current?.isActive('orderedList') ?? false,
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

  return (
    <div className="editor">
      <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
        <button
          type="button"
          className="editor-tool"
          aria-pressed={active.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          Bold
        </button>
        <button
          type="button"
          className="editor-tool"
          aria-pressed={active.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          Italic
        </button>
        <button
          type="button"
          className="editor-tool"
          aria-pressed={active.heading}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          Heading
        </button>
        <button
          type="button"
          className="editor-tool"
          aria-pressed={active.bulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          Bullets
        </button>
        <button
          type="button"
          className="editor-tool"
          aria-pressed={active.orderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          Numbers
        </button>
      </div>

      <EditorContent editor={editor} className="editor-body" />
    </div>
  );
}
