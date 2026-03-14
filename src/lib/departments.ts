export interface Department {
  key: string;
  label: string;
  logo: string;
  positions: string[];
}

export const DEPARTMENTS: Department[] = [
  {
    key: 'GABA',
    label: 'GABA',
    logo: '/logos/logo GABA.png',
    positions: [
      'Directeur GABA',
      'Formateur en agriculture',
      'Technicien agricole',
      'Chargé de projet',
      'Assistant GABA',
    ],
  },
  {
    key: 'Guims Educ',
    label: 'Guims Educ',
    logo: '/logos/guims educ.jpg',
    positions: [
      'Directeur pédagogique',
      'Enseignant',
      'Coordinateur pédagogique',
      'Conseiller éducatif',
      'Assistant pédagogique',
    ],
  },
  {
    key: 'Digitbooster+',
    label: 'Digitbooster+',
    logo: '/logos/digibooster.png',
    positions: [
      'Directeur digital',
      'Développeur web',
      'Community manager',
      'Designer graphique',
      'Chef de projet digital',
      'Rédacteur web',
    ],
  },
  {
    key: 'Guims Compta',
    label: 'Guims Compta',
    logo: '/logos/guims group.jpg',
    positions: [
      'Directeur comptable',
      'Comptable principal',
      'Assistant comptable',
      'Auditeur interne',
      'Fiscaliste',
    ],
  },
  {
    key: 'GuimSelect',
    label: 'GuimSelect',
    logo: '/logos/LOGO GUIMSELECT.png',
    positions: [
      'Directeur GuimSelect',
      'Technicien électricien',
      'Chef d\'équipe',
      'Installateur',
      'Assistant technique',
    ],
  },
  {
    key: 'Guims Academy',
    label: 'Guims Academy',
    logo: '/logos/guims academy.jpg',
    positions: [
      'Directeur Guims Academy',
      'Formateur',
      'Coordinateur de formation',
      'Responsable e-learning',
      'Assistant formation',
    ],
  },
  {
    key: 'Guims Linguistic Center',
    label: 'Guims Linguistic Center',
    logo: '/logos/GUIMS LINGUISTIC CENTER.png',
    positions: [
      'Directeur linguistique',
      'Professeur d\'anglais',
      'Professeur de français',
      'Traducteur / Interprète',
      'Assistant linguistique',
    ],
  },
  {
    key: 'Direction Générale',
    label: 'Direction Générale',
    logo: '/logos/guims group.jpg',
    positions: [
      'Directeur Général',
      'Directeur Général Adjoint',
      'Secrétaire de direction',
      'Assistant de direction',
      'Responsable RH',
    ],
  },
];

/** Positions available for all departments */
export const GLOBAL_POSITIONS = ['Stagiaire'];

export function getDepartment(key: string | null): Department | undefined {
  return DEPARTMENTS.find((d) => d.key === key);
}

export function getPositionsForDepartment(deptKey: string, customPositions?: Record<string, string[]>): string[] {
  const defaults = getDepartment(deptKey)?.positions || [];
  const custom = customPositions?.[deptKey] || [];
  // Merge: defaults + custom + global, deduplicated
  const all = [...defaults, ...custom, ...GLOBAL_POSITIONS];
  return [...new Set(all)];
}

export function getDepartmentLogo(deptKey: string | null): string {
  return getDepartment(deptKey)?.logo || '/logos/guims group.jpg';
}
