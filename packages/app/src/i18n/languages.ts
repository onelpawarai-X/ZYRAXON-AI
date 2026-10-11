// Copyright (c) 2026 onelpawarai. All rights reserved.

import { countryFlag } from "./countries"

/**
 * Every language ZYRAXON can render in.
 *
 * `code` is the BCP-47 tag we store as the active locale, `native` is the name
 * written in that language's own script, and `region` is the ISO 3166-1 alpha-2
 * code the flag is derived from. `dir` drives the document direction so RTL
 * languages mirror without every component needing to know about it.
 *
 * One entry per language, not per country. A regional tag only earns a place
 * when it is written differently — Brazilian Portuguese, Traditional Chinese and
 * Serbian in Latin script are three languages with three spellings, so they
 * stay. A regional variant that only changes dates and currency, such as
 * `en-CA`, would be a second copy of the same strings under a different name,
 * so it is not offered.
 */
export type Language = {
  readonly code: string
  readonly english: string
  readonly native: string
  readonly region: string
  readonly dir: "ltr" | "rtl"
}

export const RTL = "rtl" as const

export const LANGUAGES: readonly Language[] = [
  // --- English ---
  { code: "en", english: "English", native: "English", region: "US", dir: "ltr" },

  // --- Germanic ---
  { code: "de", english: "German", native: "Deutsch", region: "DE", dir: "ltr" },
  { code: "nl", english: "Dutch", native: "Nederlands", region: "NL", dir: "ltr" },
  { code: "af", english: "Afrikaans", native: "Afrikaans", region: "ZA", dir: "ltr" },
  { code: "da", english: "Danish", native: "Dansk", region: "DK", dir: "ltr" },
  { code: "sv", english: "Swedish", native: "Svenska", region: "SE", dir: "ltr" },
  { code: "no", english: "Norwegian", native: "Norsk", region: "NO", dir: "ltr" },
  { code: "nb", english: "Norwegian Bokmål", native: "Norsk bokmål", region: "NO", dir: "ltr" },
  { code: "nn", english: "Norwegian Nynorsk", native: "Norsk nynorsk", region: "NO", dir: "ltr" },
  { code: "fo", english: "Faroese", native: "Føroyskt", region: "FO", dir: "ltr" },
  { code: "is", english: "Icelandic", native: "Íslenska", region: "IS", dir: "ltr" },
  { code: "yi", english: "Yiddish", native: "ייִדיש", region: "IL", dir: RTL },
  { code: "lb", english: "Luxembourgish", native: "Lëtzebuergesch", region: "LU", dir: "ltr" },
  { code: "nds", english: "Low German", native: "Plattdüütsch", region: "DE", dir: "ltr" },

  // --- Romance ---
  { code: "fr", english: "French", native: "Français", region: "FR", dir: "ltr" },
  { code: "es", english: "Spanish", native: "Español", region: "ES", dir: "ltr" },
  { code: "pt", english: "Portuguese", native: "Português", region: "PT", dir: "ltr" },
  { code: "pt-BR", english: "Brazilian Portuguese", native: "Português (Brasil)", region: "BR", dir: "ltr" },
  { code: "it", english: "Italian", native: "Italiano", region: "IT", dir: "ltr" },
  { code: "ca", english: "Catalan", native: "Català", region: "ES", dir: "ltr" },
  { code: "gl", english: "Galician", native: "Galego", region: "ES", dir: "ltr" },
  { code: "eu", english: "Basque", native: "Euskara", region: "ES", dir: "ltr" },
  { code: "oc", english: "Occitan", native: "Occitan", region: "FR", dir: "ltr" },
  { code: "rm", english: "Romansh", native: "Rumantsch", region: "CH", dir: "ltr" },
  { code: "sc", english: "Sardinian", native: "Sardu", region: "IT", dir: "ltr" },
  { code: "ast", english: "Asturian", native: "Asturianu", region: "ES", dir: "ltr" },
  { code: "an", english: "Aragonese", native: "Aragonés", region: "ES", dir: "ltr" },
  { code: "ro", english: "Romanian", native: "Română", region: "RO", dir: "ltr" },

  // --- Slavic ---
  { code: "ru", english: "Russian", native: "Русский", region: "RU", dir: "ltr" },
  { code: "uk", english: "Ukrainian", native: "Українська", region: "UA", dir: "ltr" },
  { code: "be", english: "Belarusian", native: "Беларуская", region: "BY", dir: "ltr" },
  { code: "pl", english: "Polish", native: "Polski", region: "PL", dir: "ltr" },
  { code: "cs", english: "Czech", native: "Čeština", region: "CZ", dir: "ltr" },
  { code: "sk", english: "Slovak", native: "Slovenčina", region: "SK", dir: "ltr" },
  { code: "sl", english: "Slovenian", native: "Slovenščina", region: "SI", dir: "ltr" },
  { code: "hr", english: "Croatian", native: "Hrvatski", region: "HR", dir: "ltr" },
  { code: "bs", english: "Bosnian", native: "Bosanski", region: "BA", dir: "ltr" },
  { code: "sr", english: "Serbian", native: "Српски", region: "RS", dir: "ltr" },
  { code: "sr-Latn", english: "Serbian (Latin)", native: "Srpski", region: "RS", dir: "ltr" },
  { code: "mk", english: "Macedonian", native: "Македонски", region: "MK", dir: "ltr" },
  { code: "bg", english: "Bulgarian", native: "Български", region: "BG", dir: "ltr" },
  { code: "lt", english: "Lithuanian", native: "Lietuvių", region: "LT", dir: "ltr" },
  { code: "lv", english: "Latvian", native: "Latviešu", region: "LV", dir: "ltr" },

  // --- Finno-Ugric, Baltic and Sámi ---
  { code: "et", english: "Estonian", native: "Eesti", region: "EE", dir: "ltr" },
  { code: "fi", english: "Finnish", native: "Suomi", region: "FI", dir: "ltr" },
  { code: "hu", english: "Hungarian", native: "Magyar", region: "HU", dir: "ltr" },
  { code: "se", english: "Northern Sami", native: "Davvisámegiella", region: "NO", dir: "ltr" },
  { code: "smj", english: "Lule Sami", native: "Julevsámegiella", region: "NO", dir: "ltr" },

  // --- Turkic and Mongolian ---
  { code: "tr", english: "Turkish", native: "Türkçe", region: "TR", dir: "ltr" },
  { code: "az", english: "Azerbaijani", native: "Azərbaycan", region: "AZ", dir: "ltr" },
  { code: "kk", english: "Kazakh", native: "Қазақ", region: "KZ", dir: "ltr" },
  { code: "ky", english: "Kyrgyz", native: "Кыргыз", region: "KG", dir: "ltr" },
  { code: "uz", english: "Uzbek", native: "Oʻzbek", region: "UZ", dir: "ltr" },
  { code: "tk", english: "Turkmen", native: "Türkmen", region: "TM", dir: "ltr" },
  { code: "mn", english: "Mongolian", native: "Монгол", region: "MN", dir: "ltr" },
  { code: "tt", english: "Tatar", native: "Татарча", region: "RU", dir: "ltr" },
  { code: "ba", english: "Bashkir", native: "Башҡортса", region: "RU", dir: "ltr" },
  { code: "cv", english: "Chuvash", native: "Чӑвашла", region: "RU", dir: "ltr" },
  { code: "sah", english: "Yakut", native: "Саха тыла", region: "RU", dir: "ltr" },

  // --- Semitic and Arabic-script ---
  { code: "ar", english: "Arabic", native: "العربية", region: "SA", dir: RTL },
  { code: "he", english: "Hebrew", native: "עברית", region: "IL", dir: RTL },
  { code: "am", english: "Amharic", native: "አማርኛ", region: "ET", dir: "ltr" },
  { code: "ti", english: "Tigrinya", native: "ትግርኛ", region: "ER", dir: "ltr" },
  { code: "fa", english: "Persian", native: "فارسی", region: "IR", dir: RTL },
  { code: "ps", english: "Pashto", native: "پښتو", region: "AF", dir: RTL },
  { code: "ur", english: "Urdu", native: "اردو", region: "PK", dir: RTL },
  { code: "sd", english: "Sindhi", native: "سنڌي", region: "PK", dir: RTL },
  { code: "ckb", english: "Kurdish (Sorani)", native: "کوردیی ناوەندی", region: "IQ", dir: RTL },
  { code: "ku", english: "Kurdish (Kurmanji)", native: "Kurdî", region: "TR", dir: "ltr" },
  { code: "dv", english: "Dhivehi", native: "ދިވެހި", region: "MV", dir: RTL },
  { code: "ug", english: "Uyghur", native: "ئۇيغۇرچە", region: "CN", dir: RTL },
  { code: "arc", english: "Aramaic", native: "ܣܘܪܝܝܐ", region: "IQ", dir: RTL },
  { code: "syr", english: "Syriac", native: "ܣܘܪܝܝܐ", region: "IQ", dir: RTL },
  { code: "nqo", english: "N'Ko", native: "ߒߞߏ", region: "GN", dir: "ltr" },

  // --- Indic ---
  { code: "bn", english: "Bengali", native: "বাংলা", region: "BD", dir: "ltr" },
  { code: "hi", english: "Hindi", native: "हिन्दी", region: "IN", dir: "ltr" },
  { code: "mr", english: "Marathi", native: "मराठी", region: "IN", dir: "ltr" },
  { code: "ne", english: "Nepali", native: "नेपाली", region: "NP", dir: "ltr" },
  { code: "sa", english: "Sanskrit", native: "संस्कृतम्", region: "IN", dir: "ltr" },
  { code: "si", english: "Sinhala", native: "සිංහල", region: "LK", dir: "ltr" },
  { code: "pa", english: "Punjabi", native: "ਪੰਜਾਬੀ", region: "IN", dir: "ltr" },
  { code: "gu", english: "Gujarati", native: "ગુજરાતી", region: "IN", dir: "ltr" },
  { code: "or", english: "Odia", native: "ଓଡ଼ିଆ", region: "IN", dir: "ltr" },
  { code: "ta", english: "Tamil", native: "தமிழ்", region: "IN", dir: "ltr" },
  { code: "te", english: "Telugu", native: "తెలుగు", region: "IN", dir: "ltr" },
  { code: "kn", english: "Kannada", native: "ಕನ್ನಡ", region: "IN", dir: "ltr" },
  { code: "ml", english: "Malayalam", native: "മലയാളം", region: "IN", dir: "ltr" },
  { code: "as", english: "Assamese", native: "অসমীয়া", region: "IN", dir: "ltr" },
  { code: "mni", english: "Manipuri", native: "মৈতৈলোন্", region: "IN", dir: "ltr" },
  { code: "doi", english: "Dogri", native: "डोगरी", region: "IN", dir: "ltr" },
  { code: "bho", english: "Bhojpuri", native: "भोजपुरी", region: "IN", dir: "ltr" },
  { code: "raj", english: "Rajasthani", native: "राजस्थानी", region: "IN", dir: "ltr" },
  { code: "tcy", english: "Tulu", native: "ತುಳು", region: "IN", dir: "ltr" },
  { code: "kok", english: "Konkani", native: "कोंकणी", region: "IN", dir: "ltr" },
  { code: "gom", english: "Goan Konkani", native: "गों कोंकणी", region: "IN", dir: "ltr" },
  { code: "mai", english: "Maithili", native: "मैथिली", region: "IN", dir: "ltr" },
  { code: "new", english: "Newari", native: "नेपाल भाषा", region: "NP", dir: "ltr" },
  { code: "syl", english: "Sylheti", native: "সিলিটি", region: "BD", dir: "ltr" },
  { code: "ctg", english: "Chittagonian", native: "চট্টগ্রামী", region: "BD", dir: "ltr" },
  { code: "rkt", english: "Rangpuri", native: "রাঙ্গপুরী", region: "BD", dir: "ltr" },
  { code: "bpy", english: "Bishnupriya", native: "বিষ্ণুপ্রিয়া", region: "BD", dir: "ltr" },
  { code: "sat", english: "Santali", native: "ᱥᱟᱱᱛᱟᱲ", region: "IN", dir: "ltr" },

  // --- Caucasian and Iranian ---
  { code: "hy", english: "Armenian", native: "Հայերեն", region: "AM", dir: "ltr" },
  { code: "ka", english: "Georgian", native: "ქართული", region: "GE", dir: "ltr" },
  { code: "os", english: "Ossetian", native: "Ирон", region: "RU", dir: "ltr" },
  { code: "ab", english: "Abkhazian", native: "Аҧсуа", region: "GE", dir: "ltr" },
  { code: "tg", english: "Tajik", native: "Тоҷикӣ", region: "TJ", dir: "ltr" },

  // --- East and Southeast Asia ---
  { code: "zh", english: "Chinese (Simplified)", native: "简体中文", region: "CN", dir: "ltr" },
  { code: "zht", english: "Chinese (Traditional)", native: "繁體中文", region: "TW", dir: "ltr" },
  { code: "ja", english: "Japanese", native: "日本語", region: "JP", dir: "ltr" },
  { code: "ko", english: "Korean", native: "한국어", region: "KR", dir: "ltr" },
  { code: "vi", english: "Vietnamese", native: "Tiếng Việt", region: "VN", dir: "ltr" },
  { code: "th", english: "Thai", native: "ไทย", region: "TH", dir: "ltr" },
  { code: "lo", english: "Lao", native: "ລາວ", region: "LA", dir: "ltr" },
  { code: "km", english: "Khmer", native: "ខ្មែរ", region: "KH", dir: "ltr" },
  { code: "my", english: "Burmese", native: "မြန်မာ", region: "MM", dir: "ltr" },
  { code: "shn", english: "Shan", native: "လိၵ်ႈတႆး", region: "MM", dir: "ltr" },
  { code: "yue", english: "Cantonese", native: "粵語", region: "HK", dir: "ltr" },
  { code: "nan", english: "Min Nan", native: "閩南語", region: "TW", dir: "ltr" },
  { code: "wuu", english: "Wu Chinese", native: "吳語", region: "CN", dir: "ltr" },
  { code: "hak", english: "Hakka", native: "客家話", region: "CN", dir: "ltr" },
  { code: "bo", english: "Tibetan", native: "བོད་སྐད", region: "CN", dir: "ltr" },
  { code: "dz", english: "Dzongkha", native: "རྫོང་ཁ", region: "BT", dir: "ltr" },
  { code: "ii", english: "Sichuan Yi", native: "ꆈꌠ꒿", region: "CN", dir: "ltr" },

  // --- Maritime Southeast Asia ---
  { code: "ms", english: "Malay", native: "Bahasa Melayu", region: "MY", dir: "ltr" },
  { code: "id", english: "Indonesian", native: "Bahasa Indonesia", region: "ID", dir: "ltr" },
  { code: "jv", english: "Javanese", native: "Basa Jawa", region: "ID", dir: "ltr" },
  { code: "su", english: "Sundanese", native: "Basa Sunda", region: "ID", dir: "ltr" },
  { code: "tl", english: "Tagalog", native: "Tagalog", region: "PH", dir: "ltr" },
  { code: "fil", english: "Filipino", native: "Filipino", region: "PH", dir: "ltr" },
  { code: "ceb", english: "Cebuano", native: "Cebuano", region: "PH", dir: "ltr" },
  { code: "ilo", english: "Ilocano", native: "Pagsasao nga Ilokano", region: "PH", dir: "ltr" },
  { code: "bcl", english: "Bicolano", native: "Bikol", region: "PH", dir: "ltr" },
  { code: "war", english: "Waray", native: "Winaray", region: "PH", dir: "ltr" },
  { code: "tgl", english: "Tagalog (Latin)", native: "Tagalog", region: "PH", dir: "ltr" },

  // --- Pacific ---
  { code: "mri", english: "Maori", native: "Te Reo Māori", region: "NZ", dir: "ltr" },
  { code: "sm", english: "Samoan", native: "Gagana Sāmoa", region: "WS", dir: "ltr" },
  { code: "to", english: "Tongan", native: "Lea faka-Tonga", region: "TO", dir: "ltr" },
  { code: "fj", english: "Fijian", native: "Na Vosa Vakaviti", region: "FJ", dir: "ltr" },
  { code: "hif", english: "Fiji Hindi", native: "फ़िज़ी हिन्दी", region: "FJ", dir: "ltr" },
  { code: "ht", english: "Haitian Creole", native: "Kreyòl Ayisyen", region: "HT", dir: "ltr" },
  { code: "ty", english: "Tahitian", native: "Reo Tahiti", region: "PF", dir: "ltr" },
  { code: "mi", english: "Maori (Cook Islands)", native: "Te Reo Māori", region: "CK", dir: "ltr" },
  { code: "niu", english: "Niuean", native: "Niuē", region: "NU", dir: "ltr" },
  { code: "tvl", english: "Tuvalu", native: "Te 'gana Tūvalu", region: "TV", dir: "ltr" },
  { code: "gil", english: "Gilbertese", native: "Taunggit", region: "KI", dir: "ltr" },

  // --- Africa ---
  { code: "sw", english: "Swahili", native: "Kiswahili", region: "KE", dir: "ltr" },
  { code: "rw", english: "Kinyarwanda", native: "Ikinyarwanda", region: "RW", dir: "ltr" },
  { code: "rn", english: "Kirundi", native: "Ikirundi", region: "BI", dir: "ltr" },
  { code: "sn", english: "Shona", native: "ChiShona", region: "ZW", dir: "ltr" },
  { code: "nd", english: "Northern Ndebele", native: "isiNdebele", region: "ZW", dir: "ltr" },
  { code: "nr", english: "Southern Ndebele", native: "isiNdebele", region: "ZA", dir: "ltr" },
  { code: "ss", english: "Swati", native: "SiSwati", region: "SZ", dir: "ltr" },
  { code: "ts", english: "Tsonga", native: "Xitsonga", region: "ZA", dir: "ltr" },
  { code: "ve", english: "Venda", native: "Tshivenḓa", region: "ZA", dir: "ltr" },
  { code: "so", english: "Somali", native: "Soomaali", region: "SO", dir: "ltr" },
  { code: "om", english: "Oromo", native: "Afaan Oromoo", region: "ET", dir: "ltr" },
  { code: "ha", english: "Hausa", native: "Harshen Hausa", region: "NG", dir: "ltr" },
  { code: "yo", english: "Yoruba", native: "Yorùbá", region: "NG", dir: "ltr" },
  { code: "ig", english: "Igbo", native: "Asụsụ Igbo", region: "NG", dir: "ltr" },
  { code: "zu", english: "Zulu", native: "isiZulu", region: "ZA", dir: "ltr" },
  { code: "xh", english: "Xhosa", native: "isiXhosa", region: "ZA", dir: "ltr" },
  { code: "st", english: "Sesotho", native: "Sesotho", region: "LS", dir: "ltr" },
  { code: "tn", english: "Tswana", native: "Setswana", region: "BW", dir: "ltr" },
  { code: "ak", english: "Akan", native: "Akan", region: "GH", dir: "ltr" },
  { code: "tw", english: "Twi", native: "Twi", region: "GH", dir: "ltr" },
  { code: "ee", english: "Ewe", native: "Eʋegbe", region: "GH", dir: "ltr" },
  { code: "lg", english: "Ganda", native: "Oluganda", region: "UG", dir: "ltr" },
  { code: "luo", english: "Dholuo", native: "Dholuo", region: "KE", dir: "ltr" },
  { code: "kam", english: "Kamba", native: "Kikamba", region: "KE", dir: "ltr" },
  { code: "ln", english: "Lingala", native: "Lingála", region: "CD", dir: "ltr" },
  { code: "kg", english: "Kongo", native: "Kikongo", region: "CD", dir: "ltr" },
  { code: "sg", english: "Sango", native: "Yângâ tî sängö", region: "CF", dir: "ltr" },
  { code: "mg", english: "Malagasy", native: "Malagasy", region: "MG", dir: "ltr" },
  { code: "mfe", english: "Mauritian Creole", native: "Morisyen", region: "MU", dir: "ltr" },
  { code: "crs", english: "Seychellois Creole", native: "Seychellois", region: "SC", dir: "ltr" },
  { code: "bem", english: "Bemba", native: "Ichibemba", region: "ZM", dir: "ltr" },
  { code: "ny", english: "Chichewa", native: "ChiCheŵa", region: "MW", dir: "ltr" },
  { code: "loz", english: "Lozi", native: "Silozi", region: "ZM", dir: "ltr" },
  { code: "nso", english: "Northern Sotho", native: "Sesotho sa Leboa", region: "ZA", dir: "ltr" },
  { code: "snk", english: "Soninke", native: "Soninké", region: "ML", dir: "ltr" },
  { code: "ber", english: "Berber", native: "Tamazight", region: "MA", dir: "ltr" },
  { code: "kab", english: "Kabyle", native: "Taqbaylit", region: "DZ", dir: "ltr" },
  { code: "aa", english: "Afar", native: "Qafár af", region: "DJ", dir: "ltr" },
  { code: "sid", english: "Sidamo", native: "Sidaamu Afoo", region: "ET", dir: "ltr" },
  { code: "wal", english: "Wolaytta", native: "Wolaytta", region: "ET", dir: "ltr" },
  { code: "tig", english: "Tigre", native: "ትግረ", region: "ER", dir: "ltr" },
  { code: "byn", english: "Blin", native: "ብሊኛ", region: "ER", dir: "ltr" },
  { code: "tet", english: "Tetum", native: "Tetun", region: "TL", dir: "ltr" },
  { code: "tpi", english: "Tok Pisin", native: "Tok Pisin", region: "PG", dir: "ltr" },
  { code: "bi", english: "Bislama", native: "Bislama", region: "VU", dir: "ltr" },
  { code: "pau", english: "Palauan", native: "a tekoi er a Belau", region: "PW", dir: "ltr" },
  { code: "nrf", english: "Nafsan", native: "Nafsan", region: "VU", dir: "ltr" },

  // --- Europe minor and constructed ---
  { code: "el", english: "Greek", native: "Ελληνικά", region: "GR", dir: "ltr" },
  { code: "cy", english: "Welsh", native: "Cymraeg", region: "GB", dir: "ltr" },
  { code: "ga", english: "Irish", native: "Gaeilge", region: "IE", dir: "ltr" },
  { code: "gd", english: "Scottish Gaelic", native: "Gàidhlig", region: "GB", dir: "ltr" },
  { code: "kw", english: "Cornish", native: "Kernewek", region: "GB", dir: "ltr" },
  { code: "fy", english: "Western Frisian", native: "Frysk", region: "NL", dir: "ltr" },
  { code: "br", english: "Breton", native: "Brezhoneg", region: "FR", dir: "ltr" },
  { code: "mt", english: "Maltese", native: "Malti", region: "MT", dir: "ltr" },
  { code: "sq", english: "Albanian", native: "Shqip", region: "AL", dir: "ltr" },
  { code: "fur", english: "Friulian", native: "Furlan", region: "IT", dir: "ltr" },
  { code: "srr", english: "Serer", native: "Seereer", region: "SN", dir: "ltr" },
  { code: "men", english: "Mende", native: "Mɛnde yia", region: "SL", dir: "ltr" },
  { code: "kri", english: "Krio", native: "Krio", region: "SL", dir: "ltr" },
  { code: "tem", english: "Timne", native: "KʌThemnɛ", region: "SL", dir: "ltr" },
  { code: "vai", english: "Vai", native: "Vai", region: "LR", dir: "ltr" },
  { code: "kr", english: "Kanuri", native: "Kanuri", region: "NG", dir: "ltr" },
  { code: "tiv", english: "Tiv", native: "Tiv", region: "NG", dir: "ltr" },
  { code: "bm", english: "Bambara", native: "Bamanankan", region: "ML", dir: "ltr" },
  { code: "dyu", english: "Dyula", native: "Julakan", region: "ML", dir: "ltr" },
  { code: "mos", english: "Mossi", native: "Mòoré", region: "BF", dir: "ltr" },
  { code: "ff", english: "Fula", native: "Fulfulde", region: "SN", dir: "ltr" },
  { code: "ff-Adlm", english: "Fula (Adlam)", native: "Fulfulde (Adlam)", region: "GN", dir: "ltr" },
  { code: "wo", english: "Wolof", native: "Wollof", region: "SN", dir: "ltr" },
  { code: "gn", english: "Guarani", native: "Avañe'ẽ", region: "PY", dir: "ltr" },
  { code: "ay", english: "Aymara", native: "Aymar aru", region: "BO", dir: "ltr" },
  { code: "qu", english: "Quechua", native: "Runa Simi", region: "PE", dir: "ltr" },

  // --- North America and Arctic ---
  { code: "nv", english: "Navajo", native: "Diné bizaad", region: "US", dir: "ltr" },
  { code: "hop", english: "Hopi", native: "Hopìvayi", region: "US", dir: "ltr" },
  { code: "chr", english: "Cherokee", native: "ᏣᎳᎩ", region: "US", dir: "ltr" },
  { code: "iu", english: "Inuktitut", native: "ᐃᓄᒃᑎᑐᑦ", region: "CA", dir: "ltr" },
  { code: "oj", english: "Ojibwe", native: "Anishinaabemowin", region: "CA", dir: "ltr" },
  { code: "crk", english: "Cree", native: "ᓀᐦᐃᔭᐍᐏᐣ", region: "CA", dir: "ltr" },
  { code: "kl", english: "Kalaallisut", native: "Kalaallisut", region: "GL", dir: "ltr" },
  { code: "gv", english: "Manx", native: "Gaelg", region: "IM", dir: "ltr" },
  { code: "ch", english: "Chamorro", native: "Chamoru", region: "GU", dir: "ltr" },
  { code: "mah", english: "Marshallese", native: "Kajin M̧ajeļ", region: "MH", dir: "ltr" },
  { code: "ho", english: "Hiri Motu", native: "Hiri Motu", region: "PG", dir: "ltr" },
  { code: "efi", english: "Efik", native: "Efik", region: "NG", dir: "ltr" },

  // --- Constructed ---
  { code: "eo", english: "Esperanto", native: "Esperanto", region: "UN", dir: "ltr" },
  { code: "la", english: "Latin", native: "Latina", region: "UN", dir: "ltr" },
  { code: "ie", english: "Interlingue", native: "Interlingue", region: "UN", dir: "ltr" },
  { code: "ido", english: "Ido", native: "Ido", region: "UN", dir: "ltr" },
  { code: "tlh", english: "Klingon", native: "TlhIngan", region: "UN", dir: "ltr" },
]

const BY_CODE = new Map(LANGUAGES.map((entry) => [entry.code, entry]))

export const CODES: readonly string[] = LANGUAGES.map((entry) => entry.code)

export function findLanguage(code: string) {
  return BY_CODE.get(code)
}

export function nativeName(code: string) {
  return BY_CODE.get(code)?.native ?? code
}

export function direction(code: string): "ltr" | "rtl" {
  return BY_CODE.get(code)?.dir ?? "ltr"
}

/**
 * Regional indicator flags come straight from the ISO 3166-1 alpha-2 code, so
 * every flag here is the real one. Only `UN` is skipped, because it is not a
 * country and has no flag of its own.
 */
export function flag(code: string) {
  return countryFlag(BY_CODE.get(code)?.region ?? "")
}

/** Groups shown in the picker so a long list stays navigable. */
export const GROUPS: readonly { readonly label: string; readonly match: (entry: Language) => boolean }[] = [
  {
    label: "Popular",
    match: (entry) =>
      ["en", "bn", "hi", "ar", "zh", "zht", "ja", "ko", "es", "fr", "de", "pt-BR", "ru", "tr", "ur", "id", "it", "fa", "pl", "nl", "th", "vi", "uk"].includes(
        entry.code,
      ),
  },
  { label: "Africa", match: (entry) => /^(sw|rw|rn|sn|nd|nr|ss|ts|ve|so|om|ha|yo|ig|zu|xh|st|tn|nso|ak|tw|ee|ln|kg|ber|kab|aa|sid|wal|tig|byn|tet|tpi|mg|mfe|crs|bem|ny|loz|nso|luo|kam|srr|men|kri|tem|vai|kr|tiv|bm|dyu|mos|ff|wo)$/.test(entry.code) },
  { label: "Americas", match: (entry) => /^(gn|ay|qu|ht|nv|hop|chr|iu|oj|crk)$/.test(entry.code) },
  { label: "Asia", match: (entry) => /^(bn|hi|mr|ne|sa|si|pa|gu|or|ta|te|kn|ml|as|mni|doi|bho|raj|tcy|kok|gom|mai|new|syl|ctg|rkt|bpy|sat|bo|dz|my|shn|th|km|lo|mn|kk|uz|ky|tg|tk|hy|ka|ab|ug|ii|yue|nan|wuu|hak|ug)$/.test(entry.code) },
  { label: "Europe", match: (entry) => /^(de|nl|sv|da|no|nb|nn|fi|is|fo|et|lv|lt|ru|uk|be|pl|cs|sk|sl|hr|bs|sr|mk|bg|el|it|es|fr|pt|ca|gl|eu|oc|rm|sc|ast|an|ro|ga|cy|mt|br|tr|sq|hy|lb|nds|fy|br|fur|se|smj|yi)$/.test(entry.code) },
  { label: "Middle East", match: (entry) => /^(ar|he|fa|ur|ps|ku|ckb|dv|arc|syr|az|tr)$/.test(entry.code) },
  { label: "Pacific", match: (entry) => /^(mri|sm|to|fj|hif|ty|mi|niu|tvl|gil|bi|pau|nrf|ho|ch|mah)$/.test(entry.code) },
  { label: "Other", match: (entry) => ["eo", "la", "ie", "ido", "tlh", "kk", "mn", "be"].includes(entry.code) },
]

export function searchLanguages(query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return LANGUAGES
  return LANGUAGES.filter(
    (entry) =>
      entry.native.toLowerCase().includes(needle) ||
      entry.english.toLowerCase().includes(needle) ||
      entry.code.toLowerCase().startsWith(needle),
  )
}