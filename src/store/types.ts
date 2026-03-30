import type { EditorSlice } from './editorSlice';
import type { ObjectSlice } from './objectSlice';
import type { SelectionSlice } from './selectionSlice';
import type { ToolSlice } from './toolSlice';

export type EditorState = EditorSlice & ObjectSlice & SelectionSlice & ToolSlice;
