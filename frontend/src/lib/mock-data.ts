// Dummy data for the admin screens. No backend yet; this is replaced by API calls later.

export type Priority = 'low' | 'medium' | 'high';

export type Service = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  priority: Priority;
  isOpen: boolean;
  ticketPrefix: string;
};

export type QueueEntry = {
  id: string;
  name: string;
  ticket: string;
  joinedAt: string;
};

export const initialServices: Service[] = [
  {
    id: 'advising',
    name: 'Academic Advising',
    description: 'Meet with an advisor about degree plans, course selection, and graduation checks.',
    durationMinutes: 20,
    priority: 'high',
    isOpen: true,
    ticketPrefix: 'A',
  },
  {
    id: 'financial-aid',
    name: 'Financial Aid',
    description: 'Questions about FAFSA, scholarships, award letters, and disbursements.',
    durationMinutes: 15,
    priority: 'high',
    isOpen: true,
    ticketPrefix: 'F',
  },
  {
    id: 'it-help',
    name: 'IT Help Desk',
    description: 'Password resets, Wi-Fi access, and laptop troubleshooting.',
    durationMinutes: 10,
    priority: 'medium',
    isOpen: true,
    ticketPrefix: 'T',
  },
  {
    id: 'registrar',
    name: 'Registrar Services',
    description: 'Transcripts, enrollment verification, and records updates.',
    durationMinutes: 10,
    priority: 'medium',
    isOpen: true,
    ticketPrefix: 'R',
  },
  {
    id: 'id-office',
    name: 'Student ID Office',
    description: 'New or replacement student ID cards.',
    durationMinutes: 5,
    priority: 'low',
    isOpen: false,
    ticketPrefix: 'S',
  },
  ...(
    [
      ['counseling', 'Counseling Services', 'Same-day check-ins and scheduling with a counselor.', 30, 'high', true, 'C'],
      ['career', 'Career Center', 'Resume reviews, mock interviews, and job search help.', 25, 'medium', true, 'K'],
      ['housing', 'Housing Office', 'Room assignments, maintenance requests, and move-in questions.', 15, 'medium', true, 'H'],
      ['parking', 'Parking & Transportation', 'Parking permits, citations, and shuttle passes.', 10, 'low', true, 'P'],
      ['library', 'Library Help Desk', 'Research help, study room bookings, and printing issues.', 10, 'low', true, 'L'],
      ['health', 'Health Center Check-in', 'Walk-in check-in for the campus health center.', 20, 'high', false, 'M'],
      ['international', 'International Student Office', 'Visa documents, travel signatures, and enrollment letters.', 20, 'medium', true, 'I'],
      ['bursar', 'Student Accounts (Bursar)', 'Tuition bills, payment plans, and refunds.', 15, 'medium', true, 'B'],
      ['tutoring', 'Tutoring Center', 'Drop-in tutoring for math, writing, and science courses.', 30, 'low', true, 'U'],
      ['rec-center', 'Recreation Center Front Desk', 'Memberships, equipment checkout, and locker rentals.', 5, 'low', false, 'W'],
      ['dean', 'Dean of Students', 'General student concerns and petitions.', 25, 'medium', true, 'D'],
    ] as const
  ).map(([id, name, description, durationMinutes, priority, isOpen, ticketPrefix]) => ({
    id,
    name,
    description,
    durationMinutes,
    priority,
    isOpen,
    ticketPrefix,
  })),
];

function makeQueue(prefix: string, start: number, people: [string, string][]): QueueEntry[] {
  return people.map(([name, joinedAt], i) => ({
    id: `${prefix}-${start + i}`,
    name,
    ticket: `${prefix}${String(start + i).padStart(3, '0')}`,
    joinedAt,
  }));
}

export const initialQueues: Record<string, QueueEntry[]> = {
  advising: makeQueue('A', 41, [
    ['Maria Gonzalez', '9:02 AM'],
    ['James Carter', '9:07 AM'],
    ['Priya Patel', '9:15 AM'],
    ['Daniel Kim', '9:18 AM'],
    ['Aisha Johnson', '9:26 AM'],
    ['Luis Ramirez', '9:31 AM'],
  ]),
  'financial-aid': makeQueue('F', 18, [
    ['Emily Nguyen', '9:10 AM'],
    ['Marcus Brown', '9:12 AM'],
    ['Sofia Rossi', '9:20 AM'],
    ['Kevin Okafor', '9:33 AM'],
  ]),
  'it-help': makeQueue('T', 72, [
    ['Hannah Lee', '9:05 AM'],
    ['Omar Haddad', '9:11 AM'],
    ['Grace Thompson', '9:24 AM'],
    ['Ethan Walker', '9:27 AM'],
    ['Chloe Martin', '9:29 AM'],
    ['Noah Davis', '9:35 AM'],
    ['Ava Wilson', '9:38 AM'],
    ['Ryan Chen', '9:40 AM'],
  ]),
  registrar: makeQueue('R', 9, [
    ['Isabella Garcia', '9:22 AM'],
    ['Tyler Moore', '9:36 AM'],
  ]),
  'id-office': [],
  counseling: makeQueue('C', 5, [
    ['Jordan Price', '9:14 AM'],
    ['Mia Hernandez', '9:30 AM'],
  ]),
  career: makeQueue('K', 12, [
    ['Liam Foster', '9:08 AM'],
    ['Zoe Bennett', '9:19 AM'],
    ['Arjun Mehta', '9:34 AM'],
  ]),
  housing: makeQueue('H', 30, [
    ['Olivia Scott', '9:21 AM'],
    ['Diego Alvarez', '9:25 AM'],
    ['Nora Ellis', '9:37 AM'],
    ['Samuel Reed', '9:39 AM'],
    ['Layla Hassan', '9:41 AM'],
  ]),
  parking: makeQueue('P', 50, [['Brandon Hughes', '9:33 AM']]),
  library: [],
  health: [],
  international: makeQueue('I', 7, [
    ['Wei Zhang', '9:03 AM'],
    ['Fatima Ali', '9:17 AM'],
    ['Lucas Silva', '9:28 AM'],
  ]),
  bursar: makeQueue('B', 22, [
    ['Ella Turner', '9:12 AM'],
    ['Caleb Ward', '9:32 AM'],
  ]),
  tutoring: makeQueue('U', 64, [
    ['Ivy Brooks', '9:06 AM'],
    ['Mason Gray', '9:16 AM'],
    ['Leah Cooper', '9:23 AM'],
    ['Owen Price', '9:30 AM'],
  ]),
  'rec-center': [],
  dean: makeQueue('D', 3, [['Harper Collins', '9:26 AM']]),
};
