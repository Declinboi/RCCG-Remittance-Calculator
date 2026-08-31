import { openDB, type DBSchema } from 'idb';
import { defaultSettings } from './data/defaults';
import type {
  AppSettings,
  BackupPayload,
  ChurchProfile,
  ExpenditureRecord,
  ImpressRecord,
  MonthlyRecord,
  TransferRecord,
  WeeklyIncome,
} from './types';

interface RemittanceDb extends DBSchema {
  settings: {
    key: string;
    value: AppSettings;
  };
  months: {
    key: string;
    value: MonthlyRecord;
  };
  incomes: {
    key: string;
    value: WeeklyIncome;
    indexes: { monthId: string };
  };
  transfers: {
    key: string;
    value: TransferRecord;
    indexes: { monthId: string };
  };
  expenditures: {
    key: string;
    value: ExpenditureRecord;
  };
  impress: {
    key: string;
    value: ImpressRecord;
  };
}

const DB_NAME = 'rccg-cash-remittance';
const DB_VERSION = 1;
const SETTINGS_KEY = 'main';

function normalizeSettings(settings?: AppSettings): AppSettings {
  const savedCategories = settings?.categories ?? [];
  const savedCategoryById = new Map(savedCategories.map((category) => [category.id, category]));
  const defaultCategoryIds = new Set(defaultSettings.categories.map((category) => category.id));
  const customCategories = savedCategories.filter((category) => !defaultCategoryIds.has(category.id) && category.id !== 'thanksgivingSpecial');
  const churchName = settings?.churchName || defaultSettings.churchName;
  const parishes = settings?.parishes ?? defaultSettings.parishes;
  const existingProfiles = settings?.profiles ?? [];
  const activeProfileId = settings?.activeProfileId || existingProfiles[0]?.id || 'defaultProfile';
  const profiles: ChurchProfile[] = existingProfiles.length
    ? existingProfiles.map((profile) => (profile.id === activeProfileId ? { ...profile, churchName, parishes } : profile))
    : [{ id: activeProfileId, churchName, parishes, createdAt: new Date().toISOString() }];

  return {
    ...defaultSettings,
    ...(settings ?? {}),
    churchName,
    parishes,
    activeProfileId,
    profiles,
    categories: [
      ...defaultSettings.categories.map((category) => {
        const savedCategory = savedCategoryById.get(category.id);
        if (!savedCategory) return category;
        if (category.id === 'specialThanksgiving' && savedCategory.remittanceRate === 1) return category;
        return savedCategory;
      }),
      ...customCategories,
    ],
  };
}

const dbPromise = openDB<RemittanceDb>(DB_NAME, DB_VERSION, {
  upgrade(db) {
    db.createObjectStore('settings');
    db.createObjectStore('months', { keyPath: 'id' });
    const incomes = db.createObjectStore('incomes', { keyPath: 'id' });
    incomes.createIndex('monthId', 'monthId');
    const transfers = db.createObjectStore('transfers', { keyPath: 'id' });
    transfers.createIndex('monthId', 'monthId');
    db.createObjectStore('expenditures', { keyPath: 'id' });
    db.createObjectStore('impress', { keyPath: 'id' });
  },
});

export async function getSettings() {
  const db = await dbPromise;
  const settings = await db.get('settings', SETTINGS_KEY);
  if (settings) return normalizeSettings(settings);
  await db.put('settings', defaultSettings, SETTINGS_KEY);
  return defaultSettings;
}

export async function saveSettings(settings: AppSettings) {
  const db = await dbPromise;
  await db.put('settings', normalizeSettings(settings), SETTINGS_KEY);
}

export async function getAllData() {
  const db = await dbPromise;
  const [settings, months, incomes, transfers, expenditures, impress] = await Promise.all([
    getSettings(),
    db.getAll('months'),
    db.getAll('incomes'),
    db.getAll('transfers'),
    db.getAll('expenditures'),
    db.getAll('impress'),
  ]);
  return { settings, months, incomes, transfers, expenditures, impress };
}

export async function upsertMonth(month: MonthlyRecord) {
  const db = await dbPromise;
  await db.put('months', month);
}

export async function deleteMonth(id: string) {
  const db = await dbPromise;
  const tx = db.transaction(['months', 'incomes', 'transfers'], 'readwrite');
  await tx.objectStore('months').delete(id);
  for (const row of await tx.objectStore('incomes').index('monthId').getAllKeys(id)) {
    await tx.objectStore('incomes').delete(row);
  }
  for (const row of await tx.objectStore('transfers').index('monthId').getAllKeys(id)) {
    await tx.objectStore('transfers').delete(row);
  }
  await tx.done;
}

export async function upsertIncome(record: WeeklyIncome) {
  const db = await dbPromise;
  await db.put('incomes', record);
}

export async function deleteIncome(id: string) {
  const db = await dbPromise;
  await db.delete('incomes', id);
}

export async function upsertTransfer(record: TransferRecord) {
  const db = await dbPromise;
  await db.put('transfers', record);
}

export async function deleteTransfer(id: string) {
  const db = await dbPromise;
  await db.delete('transfers', id);
}

export async function upsertExpenditure(record: ExpenditureRecord) {
  const db = await dbPromise;
  await db.put('expenditures', record);
}

export async function deleteExpenditure(id: string) {
  const db = await dbPromise;
  await db.delete('expenditures', id);
}

export async function upsertImpress(record: ImpressRecord) {
  const db = await dbPromise;
  await db.put('impress', record);
}

export async function deleteImpress(id: string) {
  const db = await dbPromise;
  await db.delete('impress', id);
}

export async function createBackup(): Promise<BackupPayload> {
  return { version: 1, exportedAt: new Date().toISOString(), ...(await getAllData()) };
}

export async function restoreBackup(payload: BackupPayload) {
  if (payload.version !== 1) throw new Error('Unsupported backup file');
  const db = await dbPromise;
  const tx = db.transaction(['settings', 'months', 'incomes', 'transfers', 'expenditures', 'impress'], 'readwrite');
  await Promise.all([
    tx.objectStore('settings').clear(),
    tx.objectStore('months').clear(),
    tx.objectStore('incomes').clear(),
    tx.objectStore('transfers').clear(),
    tx.objectStore('expenditures').clear(),
    tx.objectStore('impress').clear(),
  ]);
  await tx.objectStore('settings').put(normalizeSettings(payload.settings), SETTINGS_KEY);
  await Promise.all(payload.months.map((item) => tx.objectStore('months').put(item)));
  await Promise.all(payload.incomes.map((item) => tx.objectStore('incomes').put(item)));
  await Promise.all(payload.transfers.map((item) => tx.objectStore('transfers').put(item)));
  await Promise.all(payload.expenditures.map((item) => tx.objectStore('expenditures').put(item)));
  await Promise.all(payload.impress.map((item) => tx.objectStore('impress').put(item)));
  await tx.done;
}
