import { DAYS, MONS } from '../../shared/format';

/** 图库里的一张照片。`thumb` 是维基共享资源上的缩略图地址，任意宽度都能由它换算。 */
export interface Photo {
  readonly id: number;
  readonly title: string;
  readonly place: string;
  readonly credit: string;
  readonly album: string;
  /** `YYYY-MM-DD`。 */
  readonly date: string;
  readonly thumb: string;
  readonly fav: boolean;
}

/**
 * 图库的初始照片：真实的维基共享资源特色图片，带着它们本来的标题、地点、日期和摄影师。
 * 缩略图地址是 500px 版本，共享资源能按宽度渲染，所以格子按需要的尺寸去取。
 */
export const PHOTO_SEED: readonly Photo[] = [
  {
    id: 1,
    title: 'Sydney (AU), Coast, Australian Fur Seals',
    place: 'Sydney, Australia',
    credit: 'Dietmar Rabich',
    album: 'Coast',
    date: '2026-05-11',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Sydney_%28AU%29%2C_Coast%2C_Australian_Fur_Seals_--_2019_--_3489.jpg/500px-Sydney_%28AU%29%2C_Coast%2C_Australian_Fur_Seals_--_2019_--_3489.jpg',
    fav: false
  },
  {
    id: 2,
    title: 'New York City at night',
    place: 'New York City',
    credit: 'Paulo Barcellos Jr.',
    album: 'Cities',
    date: '2025-03-15',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/New_York_City_at_night_HDR.jpg/500px-New_York_City_at_night_HDR.jpg',
    fav: true
  },
  {
    id: 3,
    title: 'Northern lights over Mývatn (Iceland)',
    place: 'Iceland',
    credit: 'Giles Laurent',
    album: 'Skies',
    date: '2024-12-14',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/039_Northern_lights_over_M%C3%BDvatn_%28Iceland%29_Photo_by_Giles_Laurent.jpg/500px-039_Northern_lights_over_M%C3%BDvatn_%28Iceland%29_Photo_by_Giles_Laurent.jpg',
    fav: false
  },
  {
    id: 4,
    title: 'Human looking at the stars during Perseids with th',
    place: 'Under the Perseids',
    credit: 'Giles Laurent',
    album: 'Skies',
    date: '2023-12-14',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/018_Human_looking_at_the_stars_during_Perseids_with_the_Milky_Way_in_the_background_Photo_by_Giles_Laurent.jpg/500px-018_Human_looking_at_the_stars_during_Perseids_with_the_Milky_Way_in_the_background_Photo_by_Giles_Laurent.jpg',
    fav: false
  },
  {
    id: 5,
    title: 'Étang de Thau and Sète',
    place: 'Sète, France',
    credit: 'Christian Ferrer',
    album: 'Coast',
    date: '2022-01-10',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/%C3%89tang_de_Thau_and_S%C3%A8te.jpg/500px-%C3%89tang_de_Thau_and_S%C3%A8te.jpg',
    fav: true
  },
  {
    id: 6,
    title: 'Peterborough (AU), Port Campbell National Park, Worm B',
    place: 'Victoria, Australia',
    credit: 'Dietmar Rabich',
    album: 'Coast',
    date: '2021-07-20',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/Peterborough_%28AU%29%2C_Port_Campbell_National_Park%2C_Worm_Bay_--_2019_--_0863.jpg/500px-Peterborough_%28AU%29%2C_Port_Campbell_National_Park%2C_Worm_Bay_--_2019_--_0863.jpg',
    fav: false
  },
  {
    id: 7,
    title: 'Lac de Montriond',
    place: 'Haute-Savoie, France',
    credit: 'Krzysztof Golik',
    album: 'Landscapes',
    date: '2020-06-30',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Lac_de_Montriond_06.jpg/500px-Lac_de_Montriond_06.jpg',
    fav: false
  },
  {
    id: 8,
    title: 'Gaztelugache, Bermeo',
    place: 'Bermeo, Basque Country',
    credit: 'Diego Delso',
    album: 'Coast',
    date: '2019-08-13',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Gaztelugache%2C_Bermeo%2C_Pa%C3%ADs_Vasco%2C_Espa%C3%B1a%2C_2019-08-13%2C_DD_14.jpg/500px-Gaztelugache%2C_Bermeo%2C_Pa%C3%ADs_Vasco%2C_Espa%C3%B1a%2C_2019-08-13%2C_DD_14.jpg',
    fav: false
  },
  {
    id: 9,
    title: 'Water reflection of Kinkaku-ji Temple a sunny day, Kyo',
    place: 'Kyoto, Japan',
    credit: 'Basile Morin',
    album: 'Travel',
    date: '2019-08-13',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Water_reflection_of_Kinkaku-ji_Temple_a_sunny_day%2C_Kyoto%2C_Japan.jpg/500px-Water_reflection_of_Kinkaku-ji_Temple_a_sunny_day%2C_Kyoto%2C_Japan.jpg',
    fav: false
  },
  {
    id: 10,
    title: 'Sunlight through clouds and view of Ginkaku-ji Temple',
    place: 'Kyoto, Japan',
    credit: 'Basile Morin',
    album: 'Travel',
    date: '2019-06-11',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Sunlight_through_clouds_and_view_of_Ginkaku-ji_Temple_from_above%2C_Kyoto%2C_Japan.jpg/500px-Sunlight_through_clouds_and_view_of_Ginkaku-ji_Temple_from_above%2C_Kyoto%2C_Japan.jpg',
    fav: true
  },
  {
    id: 11,
    title: 'Bontecou Lake Milky Way panorama',
    place: 'Hudson Valley, New York',
    credit: 'Juliancolton',
    album: 'Skies',
    date: '2018-09-05',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Bontecou_Lake_Milky_Way_panorama.jpg/500px-Bontecou_Lake_Milky_Way_panorama.jpg',
    fav: false
  },
  {
    id: 12,
    title: 'Lo sbadiglio',
    place: '',
    credit: 'Alberto Peracchio',
    album: 'Wildlife',
    date: '2018-02-25',
    thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Lo_sbadiglio.jpg/500px-Lo_sbadiglio.jpg',
    fav: false
  },
  {
    id: 13,
    title: 'Dülmen, Börnste, Waldweg',
    place: 'Dülmen, Germany',
    credit: 'Dietmar Rabich',
    album: 'Nature',
    date: '2017-09-19',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/D%C3%BClmen%2C_B%C3%B6rnste%2C_Waldweg_--_2015_--_4649.jpg/500px-D%C3%BClmen%2C_B%C3%B6rnste%2C_Waldweg_--_2015_--_4649.jpg',
    fav: true
  },
  {
    id: 14,
    title: 'Québec city at night, view from Lévis city',
    place: 'Québec City, Canada',
    credit: 'Wilfredor',
    album: 'Cities',
    date: '2017-08-26',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/Qu%C3%A9bec_city_at_night%2C_view_from_L%C3%A9vis_city.jpg/500px-Qu%C3%A9bec_city_at_night%2C_view_from_L%C3%A9vis_city.jpg',
    fav: false
  },
  {
    id: 15,
    title: 'Vulpes lagopus in Iceland',
    place: 'Iceland',
    credit: 'Jonathen Pie https://unsplash.com/@r3dmax',
    album: 'Wildlife',
    date: '2017-01-13',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Vulpes_lagopus_in_Iceland.jpg/500px-Vulpes_lagopus_in_Iceland.jpg',
    fav: false
  },
  {
    id: 16,
    title: 'Larus occidentalis in flight',
    place: '',
    credit: 'Frank Schulenburg',
    album: 'Wildlife',
    date: '2016-01-25',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Larus_occidentalis_in_flight_%28Bodega_Head%29.jpg/500px-Larus_occidentalis_in_flight_%28Bodega_Head%29.jpg',
    fav: false
  },
  {
    id: 17,
    title: 'Afternoon at Tennfjorden, Raftsundet',
    place: 'Lofoten, Norway',
    credit: 'Ximonic (Simo Räsänen)',
    album: 'Nature',
    date: '2015-09-21',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Afternoon_at_Tennfjorden%2C_Raftsundet%2C_Hinn%C3%B8ya%2C_Norway%2C_2015_September_%2802%29.jpg/500px-Afternoon_at_Tennfjorden%2C_Raftsundet%2C_Hinn%C3%B8ya%2C_Norway%2C_2015_September_%2802%29.jpg',
    fav: false
  },
  {
    id: 18,
    title: 'Hyacinth macaw (Anodorhynchus hyacinthinus) in flight',
    place: '',
    credit: 'Charles J. Sharp',
    album: 'Wildlife',
    date: '2015-09-14',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Hyacinth_macaw_%28Anodorhynchus_hyacinthinus%29_in_flight.JPG/500px-Hyacinth_macaw_%28Anodorhynchus_hyacinthinus%29_in_flight.JPG',
    fav: false
  },
  {
    id: 19,
    title: 'Piazzetta San Marco Venice',
    place: 'Venice, Italy',
    credit: 'Benh LIEU SONG',
    album: 'Travel',
    date: '2015-07-10',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Piazzetta_San_Marco_Venice_BLS.jpg/500px-Piazzetta_San_Marco_Venice_BLS.jpg',
    fav: false
  },
  {
    id: 20,
    title: 'Mountain lake, Mylgval mountain cirque, Western Caucas',
    place: 'Western Caucasus',
    credit: 'Vyacheslav Argenberg',
    album: 'Landscapes',
    date: '2014-08-02',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Mountain_lake%2C_Mylgval_mountain_cirque%2C_Western_Caucasus.jpg/500px-Mountain_lake%2C_Mylgval_mountain_cirque%2C_Western_Caucasus.jpg',
    fav: true
  },
  {
    id: 21,
    title: 'Larus californicus Palo Alto May 2011',
    place: 'Palo Alto, California',
    credit: 'King of Hearts',
    album: 'Wildlife',
    date: '2013-10-27',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Larus_californicus_Palo_Alto_May_2011_001.jpg/500px-Larus_californicus_Palo_Alto_May_2011_001.jpg',
    fav: false
  },
  {
    id: 22,
    title: 'The Bridge',
    place: '',
    credit: 'Frank Schulenburg',
    album: 'Cities',
    date: '2013-08-15',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/The_Bridge_%28August_2013%29.jpg/500px-The_Bridge_%28August_2013%29.jpg',
    fav: false
  },
  {
    id: 23,
    title: 'Panorama Piazza San Marco and Venice on Easter 2013',
    place: 'Venice, Italy',
    credit: 'This Photo was taken by Wolfgang Moroder. ',
    album: 'Travel',
    date: '2013-03-31',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Panorama_Piazza_San_Marco_and_Venice_on_Easter_2013.jpg/500px-Panorama_Piazza_San_Marco_and_Venice_on_Easter_2013.jpg',
    fav: false
  },
  {
    id: 24,
    title: 'Namib-Naukluft Sand Dunes',
    place: 'Sossusvlei, Namibia',
    credit: 'Yathin S Krishnappa',
    album: 'Nature',
    date: '2013-02-08',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Namib-Naukluft_Sand_Dunes_%282011%29.jpg/500px-Namib-Naukluft_Sand_Dunes_%282011%29.jpg',
    fav: false
  },
  {
    id: 25,
    title: 'Canal Grande Chiesa della Salute e Dogana dal ponte de',
    place: 'Venice, Italy',
    credit: 'This Photo was taken by Wolfgang Moroder. ',
    album: 'Travel',
    date: '2012-12-12',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Canal_Grande_Chiesa_della_Salute_e_Dogana_dal_ponte_dell_Accademia.jpg/500px-Canal_Grande_Chiesa_della_Salute_e_Dogana_dal_ponte_dell_Accademia.jpg',
    fav: false
  },
  {
    id: 26,
    title: 'Aurora borealis above Storfjorden and the Lyngen Alps',
    place: 'Troms, Norway',
    credit: 'Ximonic (Simo Räsänen)',
    album: 'Skies',
    date: '2012-03-04',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Aurora_borealis_above_Storfjorden_and_the_Lyngen_Alps_in_moonlight%2C_2012_March.jpg/500px-Aurora_borealis_above_Storfjorden_and_the_Lyngen_Alps_in_moonlight%2C_2012_March.jpg',
    fav: false
  },
  {
    id: 27,
    title: 'Tilisunahütte Panorama',
    place: 'Montafon, Austria',
    credit: 'böhringer friedrich',
    album: 'Landscapes',
    date: '2011-08-01',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Tilisunah%C3%BCtte_Panorama.jpg/500px-Tilisunah%C3%BCtte_Panorama.jpg',
    fav: true
  },
  {
    id: 28,
    title: 'Sossusvlei sand dunes',
    place: 'Sossusvlei, Namibia',
    credit: 'Winfried Bruenken (Amrum)',
    album: 'Nature',
    date: '2009-12-19',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Sossusvlei_sand_dunes.jpg/500px-Sossusvlei_sand_dunes.jpg',
    fav: false
  },
  {
    id: 29,
    title: 'Havelock Island, Sandy lagoon, Andaman Islands',
    place: 'Havelock Island, Andamans',
    credit: 'Vyacheslav Argenberg',
    album: 'Coast',
    date: '2009-11-25',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Havelock_Island%2C_Sandy_lagoon%2C_Andaman_Islands.jpg/500px-Havelock_Island%2C_Sandy_lagoon%2C_Andaman_Islands.jpg',
    fav: false
  },
  {
    id: 30,
    title: 'Havelock Island, Mangrove tree on the beach, Andaman I',
    place: 'Havelock Island, Andamans',
    credit: 'Vyacheslav Argenberg',
    album: 'Coast',
    date: '2009-11-21',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/Havelock_Island%2C_Mangrove_tree_on_the_beach%2C_Andaman_Islands.jpg/500px-Havelock_Island%2C_Mangrove_tree_on_the_beach%2C_Andaman_Islands.jpg',
    fav: false
  },
  {
    id: 31,
    title: 'Chola Mountain Lake, Nepal',
    place: 'Solukhumbu, Nepal',
    credit: 'Vyacheslav Argenberg',
    album: 'Landscapes',
    date: '2009-10-18',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Chola_Mountain_Lake%2C_Nepal.jpg/500px-Chola_Mountain_Lake%2C_Nepal.jpg',
    fav: false
  },
  {
    id: 32,
    title: 'Mountains in snow, Mountain lake',
    place: 'Solukhumbu, Nepal',
    credit: 'Vyacheslav Argenberg',
    album: 'Landscapes',
    date: '2009-10-18',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Mountains_in_snow%2C_Mountain_lake%2C_Chola_Valley%2C_Nepal%2C_Himalayas.jpg/500px-Mountains_in_snow%2C_Mountain_lake%2C_Chola_Valley%2C_Nepal%2C_Himalayas.jpg',
    fav: false
  },
  {
    id: 33,
    title: 'San Francisco with two bridges and the low fog',
    place: 'San Francisco, California',
    credit: 'Brocken Inaglory',
    album: 'Cities',
    date: '2009-10-15',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/San_Francisco_with_two_bridges_and_the_low_fog.jpg/500px-San_Francisco_with_two_bridges_and_the_low_fog.jpg',
    fav: false
  },
  {
    id: 34,
    title: 'Golden Gate Bridge at sunset',
    place: 'San Francisco, California',
    credit: 'Brocken Inaglory',
    album: 'Cities',
    date: '2009-10-15',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Golden_Gate_Bridge_at_sunset_1.jpg/500px-Golden_Gate_Bridge_at_sunset_1.jpg',
    fav: false
  },
  {
    id: 35,
    title: 'Boletus in Finnish forest',
    place: 'Finland',
    credit: 'Petritap',
    album: 'Nature',
    date: '2009-09-15',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Boletus_in_Finnish_forest.jpg/500px-Boletus_in_Finnish_forest.jpg',
    fav: false
  },
  {
    id: 36,
    title: 'Sunflower macro wide',
    place: '',
    credit: 'Muhammad Mahdi Karim',
    album: 'Close-ups',
    date: '2009-03-09',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Sunflower_macro_wide.jpg/500px-Sunflower_macro_wide.jpg',
    fav: false
  },
  {
    id: 37,
    title: 'New York Midtown Skyline at night',
    place: 'New York City',
    credit: 'Diliff',
    album: 'Cities',
    date: '2008-11-02',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/New_York_Midtown_Skyline_at_night_-_Jan_2006_edit1.jpg/500px-New_York_Midtown_Skyline_at_night_-_Jan_2006_edit1.jpg',
    fav: false
  },
  {
    id: 38,
    title: "Lily Lilium 'Citronella' Flower",
    place: '',
    credit: 'Photo by and (c)2007 Derek Ramsey (Ram-Man',
    album: 'Close-ups',
    date: '2007-09-20',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Lily_Lilium_%27Citronella%27_Flower.jpg/500px-Lily_Lilium_%27Citronella%27_Flower.jpg',
    fav: false
  },
  {
    id: 39,
    title: 'Lienz',
    place: 'Lienz, Austria',
    credit: 'böhringer friedrich',
    album: 'Landscapes',
    date: '2007-09-13',
    thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Lienz_SG8.JPG/500px-Lienz_SG8.JPG',
    fav: false
  },
  {
    id: 40,
    title: 'Sossusvlei Dune Namib Desert Namibia Luca Galuzzi 2004',
    place: 'Sossusvlei, Namibia',
    credit: 'Luca Galuzzi (Lucag)',
    album: 'Nature',
    date: '2004-07-19',
    thumb:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Sossusvlei_Dune_Namib_Desert_Namibia_Luca_Galuzzi_2004.JPG/500px-Sossusvlei_Dune_Namib_Desert_Namibia_Luca_Galuzzi_2004.JPG',
    fav: false
  }
];

/*
 * upload.wikimedia.org 现在只提供固定的几档缩略图宽度：要 400 会得到一个 400 状态码，
 * 带着 HTML 正文，被 Chromium 当成不透明响应拦掉。所以每次请求都向上取最近的一档。
 */
const THUMB_SIZES = [250, 500, 1280];

/** 把缩略图地址换成不小于 `want` 的最近一档宽度。 */
export const thumbAt = (thumb: string, want: number): string => {
  const width = THUMB_SIZES.find(size => size >= want) ?? THUMB_SIZES[THUMB_SIZES.length - 1];
  return thumb.replace(/\/\d+px-/, `/${width}px-`);
};

/** `YYYY-MM-DD` 转成当天正午，避免时区把日期推到前一天。 */
export const photoDate = (date: string): Date => new Date(`${date}T12:00:00`);

/** `Monday, 27 July 2026`。 */
export const longDate = (date: string): string => {
  const day = photoDate(date);
  return `${DAYS[day.getDay()]}, ${day.getDate()} ${MONS[day.getMonth()]} ${day.getFullYear()}`;
};
