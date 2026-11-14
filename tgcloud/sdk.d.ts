declare module 'sdk' {
  import type { db as dbType } from 'sdk/db';

  export const db: typeof dbType;

  export class EndpointError extends Error {
    parameters?: Record<string, unknown>;
    constructor(description: string, parameters?: Record<string, unknown>);
  }

  export class BotApiError extends Error {
    code?: number;
    description?: string;
    parameters?: { retry_after?: number; migrate_to_chat_id?: number; [k: string]: unknown };
  }

  export class InputFile {
    constructor(data: Uint8Array, filename?: string, opts?: { type?: string });
  }

  export const api: Record<string, (params?: Record<string, unknown>) => Promise<any>>;

  export interface FetchInit {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  }

  export interface FetchResponse {
    ok: boolean;
    status: number;
    url: string;
    bodyUsed: boolean;
    json(): Promise<any>;
    text(): Promise<string>;
  }

  export function fetch(input: string, init?: FetchInit): Promise<FetchResponse>;
}

declare const console: {
  log(...args: any[]): void;
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
  trace(...args: any[]): void;
};

declare const crypto: {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
};

declare module 'sdk/db' {
  export interface ColumnBuilder<T = any> {
    primaryKey(opts?: { autoIncrement?: boolean }): ColumnBuilder<T>;
    unique(): ColumnBuilder<T>;
    notNull(): ColumnBuilder<T>;
    default(val: any): ColumnBuilder<T>;
    deprecated(reason: string): ColumnBuilder<T>;
    constraint(sqlExpr: string): ColumnBuilder<T>;
    generatedAlwaysAs(expr: any, opts?: { mode?: 'virtual' | 'stored' }): ColumnBuilder<T>;
  }

  export function table<T extends Record<string, ColumnBuilder>>(
    name: string,
    columns: T,
    extra?: (t: T) => Record<string, any>
  ): T;

  export function integer(name?: string, opts?: { mode?: string }): ColumnBuilder<number>;
  export function text(name?: string, opts?: { mode?: string }): ColumnBuilder<string>;
  export function real(name?: string): ColumnBuilder<number>;
  export function boolean(name?: string): ColumnBuilder<boolean>;
  export function json(name?: string): ColumnBuilder<any>;
  export function blob(name?: string): ColumnBuilder<Uint8Array>;

  export function index(name: string): { on(...cols: any[]): any; where(cond: any): any };
  export function uniqueIndex(name: string): { on(...cols: any[]): any; where(cond: any): any };

  export function eq(col: any, val: any): any;
  export function ne(col: any, val: any): any;
  export function gt(col: any, val: any): any;
  export function gte(col: any, val: any): any;
  export function lt(col: any, val: any): any;
  export function lte(col: any, val: any): any;
  export function and(...conds: any[]): any;
  export function or(...conds: any[]): any;
  export function not(cond: any): any;
  export function inArray(col: any, vals: any[]): any;
  export function isNull(col: any): any;
  export function isNotNull(col: any): any;
  export function asc(col: any): any;
  export function desc(col: any): any;
  export function sql(strings: TemplateStringsArray, ...values: any[]): any;

  export const db: {
    select(projection?: Record<string, any>): {
      from(tbl: any): any;
    };
    insert(tbl: any): {
      values(vals: any): any;
    };
    update(tbl: any): {
      set(vals: Record<string, any>): {
        where(cond: any): Promise<any> & { returning(proj?: any): Promise<any[]> };
      };
    };
    delete(tbl: any): {
      where(cond: any): Promise<any>;
    };
    $count(tbl: any, where?: any): Promise<number>;
    run(query: any, params?: any): Promise<{ rowsAffected: number; lastInsertRowid: number; rows: any[] }>;
    all(query: any, params?: any): Promise<any[]>;
    get(query: any, params?: any): Promise<any | null>;
    values(query: any, params?: any): Promise<any[][]>;
  };
}
