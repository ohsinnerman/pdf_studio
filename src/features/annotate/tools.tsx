import {
  Circle,
  Eraser,
  Highlighter,
  ImagePlus,
  Minus,
  MousePointer2,
  MoveUpRight,
  PenLine,
  Signature,
  Square,
  SquareX,
  StickyNote,
  Strikethrough,
  TextCursorInput,
  Type,
  Underline,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { Tool } from '../../state/store.ts';

interface ToolDef {
  readonly tool: Tool;
  readonly label: string;
  readonly key: string;
  readonly icon: ReactNode;
}

/** Every tool, with its single-letter shortcut. App.tsx registers the same keys. */
export const TOOL_GROUPS: readonly (readonly ToolDef[])[] = [
  [
    { tool: 'select', label: 'Select', key: 'V', icon: <MousePointer2 /> },
    { tool: 'editText', label: 'Edit text', key: 'E', icon: <TextCursorInput /> },
  ],
  [
    { tool: 'highlight', label: 'Highlight text', key: 'H', icon: <Highlighter /> },
    { tool: 'underline', label: 'Underline text', key: 'U', icon: <Underline /> },
    { tool: 'strikeout', label: 'Strike through text', key: 'K', icon: <Strikethrough /> },
  ],
  [
    { tool: 'ink', label: 'Draw', key: 'D', icon: <PenLine /> },
    { tool: 'rectangle', label: 'Rectangle', key: 'M', icon: <Square /> },
    { tool: 'ellipse', label: 'Ellipse', key: 'O', icon: <Circle /> },
    { tool: 'line', label: 'Line', key: 'L', icon: <Minus /> },
    { tool: 'arrow', label: 'Arrow', key: 'A', icon: <MoveUpRight /> },
  ],
  [
    { tool: 'textbox', label: 'Text box', key: 'T', icon: <Type /> },
    { tool: 'note', label: 'Sticky note', key: 'N', icon: <StickyNote /> },
    { tool: 'image', label: 'Image', key: 'I', icon: <ImagePlus /> },
    { tool: 'signature', label: 'Signature', key: 'S', icon: <Signature /> },
  ],
  [
    { tool: 'whiteout', label: 'Cover with white (hides, does not remove)', key: 'W', icon: <Eraser /> },
    { tool: 'redaction', label: 'Mark for redaction (removes for real)', key: 'X', icon: <SquareX /> },
  ],
];
