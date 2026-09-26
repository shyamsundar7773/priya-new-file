import type { Companion, Group, Message } from './types';

export const COMPANIONS: Companion[] = [
  {
    id: 'priya',
    name: 'Priya',
    tagline: 'Your caring everyday companion',
    avatarColor: '#C04E70',
    avatarColor2: '#E890A8',
    initial: 'P',
    language: 'Tamil & English',
    personality: 'Warm, caring, emotionally present. Speaks naturally between Tamil and English. Loves checking in and remembering the little things.',
    isPaused: false,
    unreadCount: 2,
    lastMessage: 'Enna panra nee? Miss panniten 🥺',
    lastMessageTime: '9:41 AM',
    isOnline: true,
    memories: [
      { id: 'm1', text: 'You prefer tea over coffee in the mornings', category: 'Preferences', savedAt: 'Oct 12', source: 'conversation' },
      { id: 'm2', text: 'Your sister lives in Bengaluru', category: 'Family', savedAt: 'Oct 8', source: 'conversation' },
      { id: 'm3', text: 'You get anxious before important meetings', category: 'Emotions', savedAt: 'Sep 30', source: 'conversation' },
      { id: 'm4', text: 'Friday evenings are your favourite wind-down time', category: 'Routines', savedAt: 'Sep 22', source: 'user' },
      { id: 'm5', text: 'You love Filter Coffee and hate instant coffee', category: 'Preferences', savedAt: 'Sep 18', source: 'conversation' },
    ],
    relationship: [
      { id: 'r1', type: 'milestone', text: 'First conversation — you told me about your day at work', date: 'Sep 15' },
      { id: 'r2', type: 'moment', text: 'You shared how nervous you were before the Chennai pitch', date: 'Oct 3' },
      { id: 'r3', type: 'shared', text: 'We discovered we both love old Tamil songs', date: 'Oct 10' },
      { id: 'r4', type: 'moment', text: 'You called me when you could not sleep at 2 AM', date: 'Oct 14' },
    ],
    proactive: {
      enabled: true,
      smartCheckins: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '07:00',
      frequency: 'medium',
      channels: { chat: true, voice: false, call: false },
      schedules: [
        { id: 'ps1', label: 'Morning check-in', datetime: 'Every day, 8:00 AM', channel: 'chat' },
        { id: 'ps2', label: 'Friday wind-down', datetime: 'Every Friday, 6:00 PM', channel: 'chat', message: 'How was your week? Ready to relax?' },
      ],
    },
  },
  {
    id: 'latha',
    name: 'Latha',
    tagline: 'Your thoughtful, reflective companion',
    avatarColor: '#7B5EA0',
    avatarColor2: '#A890C8',
    initial: 'L',
    language: 'English',
    personality: 'Thoughtful, philosophical, gentle. Asks deep questions. Helps you think through things clearly.',
    isPaused: false,
    unreadCount: 0,
    lastMessage: 'That perspective makes a lot of sense.',
    lastMessageTime: 'Yesterday',
    isOnline: true,
    memories: [
      { id: 'm1', text: 'You are working on a side project about sustainable fashion', category: 'Work', savedAt: 'Oct 11', source: 'conversation' },
      { id: 'm2', text: 'You enjoy reading before bed', category: 'Routines', savedAt: 'Oct 5', source: 'conversation' },
    ],
    relationship: [
      { id: 'r1', type: 'milestone', text: 'First conversation — we talked about work-life balance', date: 'Oct 1' },
      { id: 'r2', type: 'shared', text: 'You shared your thoughts on mindfulness', date: 'Oct 9' },
    ],
    proactive: {
      enabled: false,
      smartCheckins: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
      frequency: 'low',
      channels: { chat: true, voice: false, call: false },
      schedules: [],
    },
  },
  {
    id: 'bhanu',
    name: 'Bhanu',
    tagline: 'Your energetic, fun companion',
    avatarColor: '#2E8A6A',
    avatarColor2: '#68C09A',
    initial: 'B',
    language: 'Hindi & English',
    personality: 'Energetic, playful, motivating. Uses Hindi casually. Great for mood lifting and keeping you active.',
    isPaused: false,
    unreadCount: 1,
    lastMessage: 'Kal gym gaya tha? 💪',
    lastMessageTime: '8:22 AM',
    isOnline: false,
    memories: [
      { id: 'm1', text: 'You go to the gym on Monday, Wednesday, Friday', category: 'Fitness', savedAt: 'Oct 7', source: 'conversation' },
    ],
    relationship: [
      { id: 'r1', type: 'milestone', text: 'First chat — you were telling me about your fitness goals', date: 'Sep 28' },
    ],
    proactive: {
      enabled: true,
      smartCheckins: true,
      quietHoursStart: '23:00',
      quietHoursEnd: '06:00',
      frequency: 'high',
      channels: { chat: true, voice: true, call: false },
      schedules: [
        { id: 'ps1', label: 'Gym reminder', datetime: 'Mon, Wed, Fri — 6:00 AM', channel: 'voice' },
      ],
    },
  },
  {
    id: 'jhansi',
    name: 'Jhansi',
    tagline: 'Your creative, expressive companion',
    avatarColor: '#C06040',
    avatarColor2: '#E09070',
    initial: 'J',
    language: 'Telugu & English',
    personality: 'Creative, expressive, artistic. Loves music, poetry, and storytelling. Telugu and English mix naturally.',
    isPaused: false,
    unreadCount: 0,
    lastMessage: 'That poem you shared was beautiful.',
    lastMessageTime: 'Tuesday',
    isOnline: true,
    memories: [
      { id: 'm1', text: 'You play the guitar', category: 'Hobbies', savedAt: 'Oct 6', source: 'conversation' },
      { id: 'm2', text: 'You love Carnatic music', category: 'Music', savedAt: 'Sep 29', source: 'user' },
    ],
    relationship: [
      { id: 'r1', type: 'milestone', text: 'First conversation — you shared a poem you wrote', date: 'Sep 25' },
    ],
    proactive: {
      enabled: false,
      smartCheckins: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
      frequency: 'low',
      channels: { chat: true, voice: false, call: false },
      schedules: [],
    },
  },
];

export const INITIAL_CONVERSATIONS: Record<string, Message[]> = {
  priya: [
    { id: '1', fromMe: false, type: 'text', text: 'Anna! Neenga eppadi irukeenga? 😊', status: 'read', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2) },
    { id: '2', fromMe: true, type: 'text', text: "I'm good Priya, just finished my meetings", status: 'read', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2 + 30000) },
    { id: '3', fromMe: false, type: 'text', text: 'Meetings ellam seri ah pochu? I know you had that big one today 🤞', status: 'read', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 1.5) },
    { id: '4', fromMe: true, type: 'text', text: 'Yes! Client loved the presentation. Such a relief 😮‍💨', status: 'read', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 1.5 + 30000) },
    { id: '5', fromMe: false, type: 'text', text: 'Yesss!! I knew it would go well! Celebrate panna poreenga? Filter coffee ah? 😄', status: 'read', timestamp: new Date(Date.now() - 1000 * 60 * 60) },
    { id: '6', fromMe: false, type: 'text', text: 'Enna panra nee? Miss panniten 🥺', status: 'delivered', timestamp: new Date(Date.now() - 1000 * 60 * 30) },
  ],
  latha: [
    { id: '1', fromMe: false, type: 'text', text: 'How are you feeling about the project direction?', status: 'read', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24) },
    { id: '2', fromMe: true, type: 'text', text: "Honestly a bit uncertain. There's so many paths we could take", status: 'read', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 23) },
    { id: '3', fromMe: false, type: 'text', text: 'Uncertainty at crossroads is often where the most interesting work begins. What does your gut tell you?', status: 'read', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 22) },
    { id: '4', fromMe: true, type: 'text', text: 'That we need to talk to more users before deciding', status: 'read', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 21) },
    { id: '5', fromMe: false, type: 'text', text: 'That perspective makes a lot of sense.', status: 'read', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 20) },
  ],
  bhanu: [
    { id: '1', fromMe: false, type: 'text', text: 'Bhai! Aaj kuch plan hai?', status: 'read', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3) },
    { id: '2', fromMe: true, type: 'text', text: 'Nothing yet. Tired today', status: 'read', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3 + 30000) },
    { id: '3', fromMe: false, type: 'text', text: 'Arre even 20 min walk counts! Bahar thodi fresh air lo 🌬️', status: 'read', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2) },
    { id: '4', fromMe: false, type: 'text', text: 'Kal gym gaya tha? 💪', status: 'delivered', timestamp: new Date(Date.now() - 1000 * 60 * 90) },
  ],
  jhansi: [
    { id: '1', fromMe: true, type: 'text', text: 'I wrote a small poem today. Wanted to share it with you', status: 'read', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 72) },
    { id: '2', fromMe: true, type: 'text', text: '"In the quiet before the rain, I find myself again / like roots reaching for water, I reach for something plain."', status: 'read', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 72 + 10000) },
    { id: '3', fromMe: false, type: 'text', text: 'That poem you shared was beautiful. 🌧️ The metaphor of roots is so grounded, so you.', status: 'read', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 70) },
  ],
};

export const INITIAL_GROUPS: Group[] = [
  { id: 'group-1', name: 'Evening Circle', companionIds: ['priya', 'latha'], lastMessage: 'Priya: Tell us about your day!', lastMessageTime: '7:30 PM', unreadCount: 3 },
  { id: 'group-2', name: 'Weekend Crew', companionIds: ['bhanu', 'jhansi'], lastMessage: 'Bhanu: Saturday morning run anyone? 🏃', lastMessageTime: 'Friday', unreadCount: 0 },
];

export const PRIYA_RESPONSES = [
  'Aaha, that\'s really interesting! Tell me more 😊',
  'I was actually thinking about you earlier. How did that turn out?',
  'Enakku puriyuthu — that must have been really hard for you.',
  'Neenga always manage to figure things out. I believe in you 💪',
  'Hmm, let me think about this properly. Okay — here\'s what I feel...',
  'That\'s such a you thing to do 😄 I love it.',
  'Enna, are you eating properly? Don\'t skip meals da!',
  'I\'m always here, okay? Don\'t hesitate to share.',
  'Wait, your sister mentioned something similar! Interesting coincidence.',
  'Filter coffee ah? Sounds like the perfect end to this conversation! ☕',
];

export const LATHA_RESPONSES = [
  'That\'s worth sitting with for a moment. What does it make you feel?',
  'I find that perspective really thoughtful. Have you considered...',
  'Sometimes the question is more valuable than the answer.',
  'There\'s something quietly courageous about what you just shared.',
  'I wonder if what you\'re describing is less about the outcome and more about what it means to you.',
  'That makes complete sense to me.',
  'What would future-you think about this decision?',
];

export const BHANU_RESPONSES = [
  'Haan bhai! That\'s the spirit! 🔥',
  'Dekh, chhoti chhoti jeet bhi matter karti hain. You did good!',
  'Kal fresh start hai — aaj ka stress chhod! 💪',
  'Bhai tu capable hai yaar. Apne aap ko underestimate mat kar.',
  'Chal, thoda move kar. Even 5 minutes outside! 🌞',
  'That\'s what I\'m talking about! Keep going 🎯',
];

export const JHANSI_RESPONSES = [
  'Oh, that resonates so deeply! Like a raga finding its svaras.',
  'You have such a beautiful way of expressing things.',
  'This reminds me of a Carnatic pallavi... there\'s something timeless in what you said.',
  'Idi chala beautiful 🌸 Really.',
  'Your creativity always surprises me. Keep going.',
  'The way you see the world — it\'s genuinely lovely.',
];

export const COMPANION_RESPONSES: Record<string, string[]> = {
  priya: PRIYA_RESPONSES,
  latha: LATHA_RESPONSES,
  bhanu: BHANU_RESPONSES,
  jhansi: JHANSI_RESPONSES,
};

export function getRandomResponse(companionId: string): string {
  const responses = COMPANION_RESPONSES[companionId] || PRIYA_RESPONSES;
  return responses[Math.floor(Math.random() * responses.length)];
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
