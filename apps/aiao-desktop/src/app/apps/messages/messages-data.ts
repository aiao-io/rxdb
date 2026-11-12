/** 一条消息：谁说的，说了什么。 */
export interface ChatMessage {
  readonly from: 'me' | 'them';
  readonly text: string;
}

/** 一段会话；`id` 稳定，新建会话插到最前面时下标会变，延迟回复靠它找到原会话。 */
export interface Chat {
  readonly id: number;
  readonly name: string;
  readonly color: string;
  readonly time: string;
  readonly group?: boolean;
  readonly messages: readonly ChatMessage[];
}

const me = (text: string): ChatMessage => ({ from: 'me', text });
const them = (text: string): ChatMessage => ({ from: 'them', text });

/** 十段种子会话，按最近活跃排序。 */
export const CHAT_SEED: readonly Chat[] = [
  {
    id: 0,
    name: 'Kate',
    color: '#64d2ff',
    time: '4:28 PM',
    messages: [
      them('lake trip still on for saturday?'),
      them('weather says clear all weekend'),
      me('yes. leaving at 6 so we get the light'),
      them('six in the morning is a threat'),
      me('bring coffee then'),
      them('bringing coffee AND a blanket, i know how you drive')
    ]
  },
  {
    id: 1,
    name: 'John',
    color: '#30d158',
    time: '2:14 PM',
    messages: [
      them('did the review land'),
      me('merged an hour ago'),
      them('legend. the animation on the sidebar is so smooth now'),
      me('took four tries to get the easing right'),
      them('it shows, in a good way')
    ]
  },
  {
    id: 2,
    name: 'Design Crew',
    color: '#bf5af2',
    time: '11:40 AM',
    group: true,
    messages: [
      them('Daniel: shadows on the unfocused windows are too heavy'),
      me('fixed — dropped the two outer layers'),
      them('Daniel: much better, they sit back now'),
      them('Freda: can we get the same treatment on the sheets?'),
      me('already in, refresh'),
      them('Freda: 🤝')
    ]
  },
  {
    id: 3,
    name: 'David',
    color: '#ff9f0a',
    time: '10:02 AM',
    messages: [
      them('are you coming to the thing on friday'),
      me('what thing'),
      them('the thing i told you about twice'),
      me('the rooftop one?'),
      them('yes. 8pm. do not be fashionably late'),
      me("i'll be unfashionably early")
    ]
  },
  {
    id: 4,
    name: 'Anna',
    color: '#0a84ff',
    time: '9:15 AM',
    messages: [
      them('random but your site loads absurdly fast'),
      me('no framework, no fonts to wait on'),
      them('i keep forgetting that is allowed')
    ]
  },
  {
    id: 5,
    name: 'Chris',
    color: '#ff2d55',
    time: 'Yesterday',
    messages: [
      them('sending you the playlist for the drive'),
      them('4 hours, no repeats'),
      me('if there is a single sad song i am turning around'),
      them('no promises')
    ]
  },
  {
    id: 6,
    name: 'Hank',
    color: '#5e5ce6',
    time: 'Yesterday',
    messages: [
      them('coffee thursday?'),
      me('the place with the bad chairs?'),
      them('the place with the good espresso and the bad chairs, yes'),
      me('deal')
    ]
  },
  {
    id: 7,
    name: 'Daniel',
    color: '#ffd60a',
    time: 'Sunday',
    messages: [them('sent you the moodboard'), me('the third row is the one'), them('knew you would say that')]
  },
  {
    id: 8,
    name: 'Freda',
    color: '#a2845e',
    time: 'Saturday',
    messages: [
      them('did you get the keys back from the landlord'),
      me('picking them up tomorrow'),
      them('text me when you do')
    ]
  },
  {
    id: 9,
    name: 'Mom',
    color: '#ff375f',
    time: 'Friday',
    messages: [
      them('did you eat'),
      me('yes'),
      them('coffee is not food'),
      me('it has water in it'),
      them('call me tonight')
    ]
  }
];

/** 对方的自动回复：发出消息 1.1 秒后随机挑一句。 */
export const REPLIES: readonly string[] = [
  "ok that's wild",
  'send the file',
  'how is this one HTML file',
  'screenshotting this',
  'wait do the windows resize too'
];
