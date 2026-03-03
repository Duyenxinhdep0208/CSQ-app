
export interface EditState {
  type: 'project-start' | 'project-end' | 'keyframe-subtitle' | 'keyframe-description' | 'keyframe-narration' | 'keyframe-start' | 'keyframe-end' | 'keyframe-progress' | 'task-name' | 'task-start' | 'task-end' | 'task-progress-month' | 'month-progress';
  id: string;
  label: string;
  value: string;
  dateContext?: Date;
}

export interface TaskProgress {
  date: string; // ISO String
  progress: number;
}

export interface Task {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  x: number;
  y: number;
  visible: boolean;
  history: TaskProgress[]; // Manual progress points over time
  color?: string;
}

export interface Keyframe {
  id: string;
  image: string; // Base64
  startDate: Date; // Start of visibility
  endDate: Date; // End of visibility
  progress: number; // Global project progress at this stage
  subtitle: string; // Used as the Title
  description: string; // Detailed description (legacy)
  narration?: string; // New: Narration text for the bottom bar
  usePreviousNarration?: boolean; // New: Flag to inherit narration from previous stage
  audioData?: string; // New: Base64 audio string uploaded by user
  audioName?: string; // New: Name of the uploaded audio file
}

export interface OverlayConfig {
  fontFamily: string;
  fontWeight: string; // e.g., 'bold', '900', 'normal'
  primaryColor: string; // For progress circle and active elements
  accentColor: string; // For year labels and text
  textColorPrimary: string; // Text color inside circles or primary headers
  textColorSecondary: string; // Subtitle text color
  monthActiveBg: string;
  monthInactiveBg: string;
  monthPastBg: string; // Background for months that have passed
  monthNextBg: string; // New: Background for the month immediately after active
  monthActiveScale: number; // Scale factor for active month background
  monthInactiveScale: number; // Scale factor for inactive month background
  monthActiveFontSize: number; // New: Font size for the active month text
  monthTextColor: string;
  monthBorderRadius: number;
  overlayOpacity: number;
  fontSizeBase: number; // Multiplier for all fonts
  progressStrokeWidth: number; // Thickness of the progress circle
  timelineHeight: number; // Percentage of canvas height (0.05 to 0.15)
  
  // Timeline Label ("TIMELINE" text) Properties
  timelineLabelShow: boolean;
  timelineLabelText: string;
  timelineLabelColor: string;
  timelineLabelFontSize: number;
  timelineLabelX: number; // 0 to 1 relative to canvas width
  timelineLabelY: number; // 0 to 1 relative to canvas height
  timelineLabelFontFamily: string;
  timelineLabelFontWeight: string;

  // Timeline Progress Bar Properties
  timelineProgressBarShow: boolean;
  timelineProgressBarColor: string;
  timelineProgressBarHeight: number;
  timelineProgressBarOpacity: number;

  // Standalone Progress Circle Properties
  circleX: number; // 0 to 1
  circleY: number; // 0 to 1
  circleScale: number; // size multiplier
  circleColor: string;
  circleOpacity: number; // 0 to 1
  circleShowLabel: boolean;
  
  // Progress Circle Background Rectangle
  circleRectShow: boolean;
  circleRectColor: string;
  circleRectOpacity: number;
  circleRectWidth: number; // in pixels at 1:1 scale
  circleRectHeight: number; // in pixels at 1:1 scale
  circleRectBorderRadius: number;
  circleRectX: number; // 0 to 1 relative to canvas width
  circleRectY: number; // 0 to 1 relative to canvas height

  // New Label Customization
  circleLabelPosition: 'top' | 'bottom' | 'left' | 'right';
  circleLabelDistance: number;
  circleLabelColor: string;
  circleLabelFontFamily: string;
  circleLabelFontSize: number;
  circleLabelLine1: string;
  circleLabelLine2: string;

  // Timeline Specific Appearance
  timelineYearFontSize: number;
  timelineYearColor: string;
  timelineYearFontWeight: string;
  timelineMonthFontSize: number;
  timelineMonthFontWeight: string;
  timelineMonthOpacity: number;
  timelineBgColor: string;

  // Task Graphics Customization
  taskX: number; // 0 to 1 relative to canvas width
  taskY: number; // 0 to 1 relative to canvas height (starting position)
  taskSpacingY: number; // 0 to 1 relative to canvas height (vertical gap)
  taskPrimaryColor: string; // Main accent color (e.g., orange)
  taskCircleBgColor: string;
  taskCircleScale: number; // New: Scale factor for task circles
  taskLabelBgColor: string;
  taskLabelBgOpacity: number; // New: Opacity for task labels
  taskLabelBorderShow: boolean; // New: Show/hide border for labels
  taskOpacity: number;
  taskFontSize: number;
  taskFontFamily: string;
  taskFontWeight: string;
  taskLabelPosition: 'top' | 'bottom' | 'left' | 'right'; // New: Position of task name
  taskPercentFontSize: number; // New: Font size for percentage inside task circle

  // Narration Bar
  narrationBarShow: boolean; // New: Toggle visibility of the bottom narration bar
  narrationFontFamily: string; // New: Font family for narration
  narrationFontSize: number; // New: Font size for narration
}

export enum GenerationStatus {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}
