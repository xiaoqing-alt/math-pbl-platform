export type Role = 'teacher' | 'student';
export type Board = 'algebra' | 'geometry' | 'stats';

export interface User {
  id: number;
  role: Role;
  username: string;
  displayName: string;
}

export interface Step {
  title: string;
  content: string;
}

export interface Stage {
  title: string;
  intro: string;
  items: string[];
  columns: string[];
  prompt: string;
}

export interface RubricItem {
  name: string;
  a: string;
  b: string;
  c: string;
  d: string;
}

export interface Criterion {
  name: string;
  weight: number;
  description: string;
}

export interface ReferenceFile {
  name: string;
  url: string;
  size: number;
}

export interface Reference {
  title: string;
  content: string;
  images: string[];
  files: ReferenceFile[];
}

export interface TaskContent {
  background: string;
  objectives: string[];
  knowledgeTags: string[];
  description: string;
  steps: Step[];
  stages: Stage[];
  tool: string;
  toolKeys: string[];
  criteria: Criterion[];
  rubric: RubricItem[];
  reflections: string[];
  references: Reference[];
}

export interface WorksheetStage {
  text: string;
  rows: string[][];
}

export interface Worksheet {
  stages: WorksheetStage[];
  selfScores: string[];
  gains: string;
  difficulties: string;
}

export interface Task {
  id: number;
  teacherId: number;
  templateId: number | null;
  board: Board;
  boardName: string;
  title: string;
  projectType: string;
  grade: string;
  duration: string;
  summary: string;
  coverImage: string;
  content: TaskContent;
  aiEnabled: boolean;
  aiSkills: string[];
  createdAt: string;
  updatedAt: string;
  assignmentCount?: number;
  submissionCount?: number;
}

export interface Template {
  id: number;
  board: Board;
  boardName: string;
  title: string;
  projectType: string;
  grade: string;
  duration: string;
  summary: string;
  coverImage: string;
  content: TaskContent;
  createdAt: string;
}

export interface ClassInfo {
  id: number;
  name: string;
  grade: string;
  studentCount: number;
  assignmentCount: number;
  createdAt?: string;
}

export interface StudentInfo {
  id: number;
  username: string;
  displayName: string;
  joinedAt?: string;
}

export interface AssignmentBrief {
  id: number;
  taskId?: number;
  classId?: number;
  taskTitle?: string;
  className?: string;
  board?: Board;
  status: 'published' | 'withdrawn';
  dueAt: string;
  publishedAt: string;
  withdrawnAt?: string;
  studentCount?: number;
  submittedCount?: number;
}

export interface FileInfo {
  name: string;
  url: string;
  size: number;
}

export interface DimensionScore {
  name: string;
  score: number;
  weight?: number;
  weightPercent?: number;
}

export interface Analysis {
  version: string;
  generatedAt: string;
  suggestedScore: number;
  wordCount: number;
  paragraphCount: number;
  fileCount: number;
  flags: Record<string, boolean>;
  dimensions: DimensionScore[];
  strengths: string[];
  improvements: string[];
  note: string;
}

export interface Submission {
  id: number;
  assignmentId: number;
  studentId: number;
  content: string;
  worksheet: Worksheet;
  files: FileInfo[];
  status: 'draft' | 'submitted';
  analysis: Analysis | null;
  submittedAt: string;
  score: number | null;
  feedback: string;
  gradedAt: string;
  updatedAt: string;
  studentName?: string;
  username?: string;
}

export interface ToolInfo {
  key: string;
  name: string;
  description: string;
  boards: Board[];
  builtin: boolean;
  category: 'inquiry' | 'assist';
  ownerId: number | null;
  createdAt?: string;
}

export interface AiSkill {
  key: string;
  name: string;
  tool: string;
  description: string;
  board: Board;
  boardName: string;
  universal?: boolean;
  recommended: boolean;
  reason: string;
}

export interface AiGuide {
  title: string;
  skillName?: string;
  intro: string;
  steps: { index: number; title: string; question: string }[];
  objectives?: string[];
  tips: string[];
  note: string;
}

export interface ClassReport {
  totalStudents: number;
  submittedCount: number;
  gradedCount: number;
  submissionRate: number;
  averageScore: number;
  distribution: { label: string; count: number }[];
  dimensions: { name: string; average: number }[];
  topStrengths: { text: string; count: number }[];
  topImprovements: { text: string; count: number }[];
  criteriaCount: number;
  students: {
    studentId: number;
    displayName: string;
    username: string;
    submitted: boolean;
    score: number | null;
    suggestedScore: number | null;
    graded: boolean;
    updatedAt: string;
  }[];
}

export interface StudentTaskCard {
  assignmentId: number;
  taskId: number;
  title: string;
  board: Board;
  boardName: string;
  summary: string;
  projectType: string;
  grade: string;
  duration: string;
  coverImage: string;
  className: string;
  teacherName: string;
  dueAt: string;
  publishedAt: string;
  aiEnabled: boolean;
  submission: {
    id: number;
    status: 'draft' | 'submitted';
    score: number | null;
    gradedAt: string;
    submittedAt: string;
  } | null;
}
