import type {
  AppSettings,
  DayRecord,
  LogRow,
  Person,
  Stats,
  SummaryRow,
} from "./queries";

export interface AdminData {
  people: Person[];
  settings: AppSettings;
  days: Record<string, DayRecord>;
  summary: SummaryRow[];
  stats: Stats;
  log: LogRow[];
}

export interface ActionResult {
  ok: boolean;
  error?: string;
  data: AdminData;
}

export interface LoginState {
  error?: string;
}
