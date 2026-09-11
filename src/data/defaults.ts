import type { AppSettings, IncomeCategory } from '../types';

export const defaultCategories: IncomeCategory[] = [
  { id: 'generalTithe', name: 'General Tithe', remittanceRate: 48, appliesToRemittance: true },
  { id: 'ministersTithe', name: 'Ministers Tithe', remittanceRate: 48, appliesToRemittance: true },
  { id: 'thanksgiving', name: 'Thanksgiving', remittanceRate: 40, appliesToRemittance: true },
  { id: 'annualThanksgiving', name: 'Annual Thanksgiving', remittanceRate: 70, appliesToRemittance: true },
  { id: 'specialThanksgiving', name: 'Special Thanksgiving', remittanceRate: 100, appliesToRemittance: true },
  { id: 'slo', name: 'SLO', remittanceRate: 30, appliesToRemittance: true },
  { id: 'project', name: 'Project', remittanceRate: 0, appliesToRemittance: false },
  { id: 'crm', name: 'CRM', remittanceRate: 40, appliesToRemittance: true },
  { id: 'gospelFund', name: 'Gospel Fund', remittanceRate: 25, appliesToRemittance: true },
  { id: 'goodWomen', name: 'Good Women', remittanceRate: 0, appliesToRemittance: false },
  { id: 'mission', name: 'Mission', remittanceRate: 0, appliesToRemittance: false },
  { id: 'sundaySchool', name: 'Sunday School', remittanceRate: 70, appliesToRemittance: true },
  { id: 'juniorChurch', name: 'Junior Church', remittanceRate: 0, appliesToRemittance: false },
  { id: 'houseFellowship', name: 'House Fellowship', remittanceRate: 0, appliesToRemittance: false },
  { id: 'firstFruit', name: '1st Fruit', remittanceRate: 90, appliesToRemittance: true },
  { id: 'hgsViewingCentre', name: 'HGS Viewing Centre', remittanceRate: 0, appliesToRemittance: false },
  { id: 'firstBornRedemption', name: '1st Born Redemption', remittanceRate: 0, appliesToRemittance: false },
  { id: 'sacrificialOffering', name: 'Sacrificial Offering', remittanceRate: 0, appliesToRemittance: false },
  { id: 'thirdSundayCsr', name: 'Third Sunday / CSR', remittanceRate: 0, appliesToRemittance: false },
  { id: 'interestFromBank', name: 'Interest from Bank', remittanceRate: 0, appliesToRemittance: false },
  { id: 'lgaf', name: 'LGAF', remittanceRate: 0, appliesToRemittance: false },
  { id: 'holyCommunion', name: 'Holy Communion', remittanceRate: 0, appliesToRemittance: false },
  { id: 'youthOffering', name: 'Youth Offering', remittanceRate: 0, appliesToRemittance: false },
  { id: 'churchProject', name: 'Church Project', remittanceRate: 0, appliesToRemittance: false },
];

export const defaultSettings: AppSettings = {
  churchName: 'HEADQUARTER CHURCH',
  parishes: [],
  activeProfileId: 'defaultProfile',
  profiles: [{ id: 'defaultProfile', churchName: 'HEADQUARTER CHURCH', parishes: [], createdAt: '2026-01-01T00:00:00.000Z' }],
  categories: defaultCategories,
};
