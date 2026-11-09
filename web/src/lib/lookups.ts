import { api } from './api';

export interface Opt {
  value: string;
  label: string;
}

/** Fetch a list endpoint and map rows to select options. */
export async function opts(
  path: string,
  map: (row: any) => Opt,
  query?: Record<string, unknown>,
): Promise<Opt[]> {
  try {
    const r = await api.list<any>(path, query);
    return (r.data ?? []).map(map);
  } catch {
    return [];
  }
}

export const lookups = {
  classes: () => opts('/academics/classes', (r) => ({ value: r.id, label: r.name }), { all: 1, pageSize: 500 }),
  sections: () => opts('/academics/sections', (r) => ({ value: r.id, label: r.name }), { all: 1, pageSize: 500 }),
  subjects: () =>
    opts('/academics/subjects', (r) => ({ value: r.id, label: `${r.code ? `${r.code} · ` : ''}${r.nameEn}` }), {
      all: 1,
      pageSize: 500,
    }),
  students: () =>
    opts(
      '/students',
      (r) => ({
        value: r.id,
        label: `${r.nameEn} (${r.admissionNo}${r.rollNo ? ` · roll ${r.rollNo}` : ''})`,
      }),
      { pageSize: 500 },
    ),
  employees: () =>
    opts(
      '/staff',
      (r) => ({ value: r.id, label: `${r.nameEn}${r.designation ? ` · ${r.designation}` : ''}` }),
      { pageSize: 500 },
    ),
  teachers: async () => {
    try {
      const r = await api.list<any>('/staff', { pageSize: 500 });
      return (r.data ?? [])
        .filter((e: any) => e.isTeacher !== false)
        .map((e: any) => ({ value: e.id, label: e.nameEn }));
    } catch {
      return [];
    }
  },
  feeHeads: () => opts('/finance/fee-heads', (r) => ({ value: r.id, label: r.nameEn }), { pageSize: 500 }),
  accountHeads: () => opts('/finance/account-heads', (r) => ({ value: r.id, label: `${r.code ? `${r.code} · ` : ''}${r.nameEn}` }), { pageSize: 500 }),
  academicYears: () => opts('/settings/academic-years', (r) => ({ value: r.id, label: r.name })),
  users: () => opts('/users', (r) => ({ value: r.id, label: `${r.username} · ${r.nameEn}` })),
  books: () => opts('/library/books', (r) => ({ value: r.id, label: r.title }), { pageSize: 500 }),
  vehicles: () => opts('/transport/vehicles', (r) => ({ value: r.id, label: `${r.plateNo ?? ''} ${r.name ?? ''}`.trim() })),
  routes: () => opts('/transport/routes', (r) => ({ value: r.id, label: r.name })),
  rooms: async (): Promise<Opt[]> => {
    try {
      const r = await api.list<any>('/hostel', { pageSize: 500 });
      const out: Opt[] = [];
      for (const h of r.data ?? []) {
        for (const room of h.rooms ?? []) {
          out.push({ value: room.id, label: `${h.name ?? 'Hostel'} · Room ${room.roomNo ?? room.number ?? room.id.slice(0, 6)}` });
        }
      }
      return out;
    } catch {
      return [];
    }
  },
  gradingScales: () => opts('/exams/grading-scales', (r) => ({ value: r.id, label: r.name })),
  structures: () => opts('/finance/fee-structures', (r) => ({ value: r.id, label: r.name })),
};

/** Combine several lookup loaders into one object. */
export async function loadAll<T extends Record<string, () => Promise<Opt[]>>>(
  spec: T,
): Promise<Record<keyof T, Opt[]>> {
  const keys = Object.keys(spec) as (keyof T)[];
  const values = await Promise.all(keys.map((k) => spec[k]()));
  const out = {} as Record<keyof T, Opt[]>;
  keys.forEach((k, i) => {
    out[k] = values[i];
  });
  return out;
}
