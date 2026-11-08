/**
 * The public privacy policy text, in both app locales.
 *
 * Deliberately NOT in `i18n/messages/*.json`: the root layout hands the whole
 * message catalog to `NextIntlClientProvider`, so several pages of legal text
 * there would be shipped to the browser on every route of the app. Imported
 * only by the server-rendered `app/privacy/page.tsx`.
 *
 * Keep this in step with what the product actually does. A new subprocessor,
 * cookie or category of personal data must be added here, in both locales, and
 * `LAST_UPDATED` moved.
 */

export const LAST_UPDATED = "2026-11-08";
export const CONTACT_EMAIL = "contacts@ludogoriesoft.com";

export type PolicyBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] };

export interface PolicySection {
  id: string;
  title: string;
  blocks: PolicyBlock[];
}

export interface PrivacyPolicy {
  title: string;
  intro: string;
  lastUpdatedLabel: string;
  contentsLabel: string;
  sections: PolicySection[];
}

const p = (text: string): PolicyBlock => ({ kind: "paragraph", text });
const list = (...items: string[]): PolicyBlock => ({ kind: "list", items });
const table = (head: string[], rows: string[][]): PolicyBlock => ({ kind: "table", head, rows });

const en: PrivacyPolicy = {
  title: "Privacy Policy",
  intro:
    "This policy explains how Ludogorie Soft EOOD handles personal data when you visit or use the New Post web application (the “Service”). It is provided in accordance with Regulation (EU) 2016/679 (GDPR) and the Bulgarian Personal Data Protection Act.",
  lastUpdatedLabel: "Last updated",
  contentsLabel: "Contents",
  sections: [
    {
      id: "controller",
      title: "1. Who is responsible for your data",
      blocks: [
        p("The data controller is:"),
        list(
          "Company: Ludogorie Soft EOOD (Лудогорие софт ЕООД)",
          "UIC (ЕИК): 206929451",
          "Address: 2 Buzludzha St., room 506, Razgrad, Bulgaria",
          "Legal representative: Emiliyan Kadiyski",
          `Email: ${CONTACT_EMAIL}`
        ),
        p(
          "When a customer company uses the Service to prepare its own social media content, that company decides what it enters and publishes. To the extent that content contains personal data, the customer company is the controller and we process that data on its behalf."
        ),
      ],
    },
    {
      id: "data",
      title: "2. What data we process",
      blocks: [
        list(
          "Account data: your name, email address, a hash of your password (never the password itself), language preference, preferred AI model, and email verification status.",
          "Company membership: the companies you belong to, your role in each (owner or editor), and who invited you.",
          "Activity records: who generated, edited, approved, rejected or published a post and when, post version history, and an audit log of actions in the Service.",
          "Content you provide: brand guidelines, post text, notes, content sources, competitor information, and images you upload. Any personal data you include in this content is processed as part of it.",
          "AI generation records: prompts, inputs and outputs of AI operations, kept so that a post's origin can be reviewed.",
          "Social channel connection data: your Buffer account identifier, the names of connected social profiles, encrypted access credentials, and engagement metrics for published posts.",
          "Publicly available content: articles, listings and competitor pages or feeds that a customer configures as a source. These may incidentally contain names of people.",
          "Technical data: when you visit the Service, our hosting provider processes your IP address, browser details and request information in its server logs. The application itself does not store your IP address."
        ),
      ],
    },
    {
      id: "purposes",
      title: "3. Why we process it and on what legal basis",
      blocks: [
        table(
          ["Purpose", "Legal basis (GDPR Art. 6(1))"],
          [
            [
              "Creating and running your account, signing you in, and verifying your email address",
              "Performance of a contract, (b)",
            ],
            [
              "Providing the Service: generating, reviewing, scheduling and publishing posts, and reporting on their performance",
              "Performance of a contract, (b)",
            ],
            [
              "Keeping the Service secure, keeping audit records, preventing abuse, and fixing faults",
              "Legitimate interests, (f)",
            ],
            [
              "Processing publicly available sources configured by a customer",
              "Legitimate interests, (f)",
            ],
            ["Replying to your enquiries", "Legitimate interests, (f)"],
            ["Meeting accounting, tax and other legal obligations", "Legal obligation, (c)"],
          ]
        ),
        p(
          "You provide account data so that we can give you access. Without it, we cannot create an account for you. Visiting this page does not require an account."
        ),
      ],
    },
    {
      id: "ai",
      title: "4. AI processing",
      blocks: [
        p(
          "The Service uses artificial intelligence to translate and classify source articles and to write post text and images. The content sent for this purpose consists of company and brand information, source material, and instructions. Your account email and password are not included. Please do not enter personal data in prompts, brand guidelines or sources unless it is necessary."
        ),
        p(
          "We do not use AI to make decisions about individuals that have legal or similarly significant effects on them. AI output concerns marketing content only."
        ),
      ],
    },
    {
      id: "recipients",
      title: "5. Who receives your data",
      blocks: [
        p(
          "We do not sell personal data. We share it only with service providers acting for us, as far as each needs it. Depending on the configuration in use, these are:"
        ),
        table(
          ["Provider", "Role"],
          [
            ["Vercel", "Application hosting and server logs"],
            ["Neon", "Database hosting"],
            ["Brevo", "Sending account verification emails"],
            ["Buffer", "Publishing posts to social networks and reading post metrics"],
            ["Cloudinary", "Image storage and delivery"],
            ["Anthropic, OpenAI, Groq", "AI text generation"],
            ["Ideogram, fal.ai, OpenAI, Leonardo.ai", "AI image generation"],
          ]
        ),
        p(
          "Some AI processing runs on infrastructure operated by us rather than by a third party. Content that you choose to publish becomes visible on the relevant social networks, which handle it under their own policies. We may also disclose data where the law requires it. Other members of a company you belong to can see your name and your activity within that company."
        ),
      ],
    },
    {
      id: "transfers",
      title: "6. Transfers outside the EEA",
      blocks: [
        p(
          "Some of these providers are based in, or process data in, countries outside the European Economic Area, including the United States. Where no European Commission adequacy decision applies, such as the EU–US Data Privacy Framework for certified recipients, we rely on appropriate safeguards such as the Commission's Standard Contractual Clauses. You can ask us for details using the contact address above."
        ),
      ],
    },
    {
      id: "retention",
      title: "7. How long we keep data",
      blocks: [
        list(
          "Account, membership and activity data: for as long as your account exists. After deletion, we erase or anonymise it, except where we need it for the purposes below.",
          "Company content, post history and AI generation records: for as long as the company uses the Service, unless deleted earlier by the company or at its request.",
          "Social channel credentials: until the connection is removed.",
          "Email verification tokens: valid for 24 hours and replaced when a new one is issued.",
          "Data needed for accounting or legal claims: for the period set by law or until the claim is resolved.",
          "Hosting logs: for the period set by the hosting provider."
        ),
      ],
    },
    {
      id: "cookies",
      title: "8. Cookies",
      blocks: [
        p(
          "We use only cookies needed for the Service to work and to remember your choices. We do not use advertising or analytics cookies, so no cookie consent is requested."
        ),
        table(
          ["Cookie", "Purpose", "Duration"],
          [
            ["authjs.session-token", "Keeps you signed in", "Up to 30 days"],
            ["authjs.csrf-token", "Protects sign-in against forged requests", "Browser session"],
            [
              "authjs.callback-url",
              "Returns you to the right page after sign-in",
              "Browser session",
            ],
            ["NEXT_LOCALE", "Remembers your language", "1 year"],
            ["active_company", "Remembers the company you last selected", "1 year"],
          ]
        ),
        p(
          "On secure connections, the authentication cookie names may carry a “__Secure-” or “__Host-” prefix."
        ),
      ],
    },
    {
      id: "security",
      title: "9. Security",
      blocks: [
        p(
          "We use technical and organisational measures appropriate to the risk. These include encrypted connections, one-way hashing of passwords, encryption at rest for social channel credentials, and role-based access within each company. No system is completely secure, so please use a strong, unique password."
        ),
      ],
    },
    {
      id: "rights",
      title: "10. Your rights",
      blocks: [
        p("Under the GDPR you have the right to:"),
        list(
          "access your personal data and receive a copy;",
          "have inaccurate data corrected;",
          "have your data erased, including deletion of your account;",
          "restrict processing in certain cases;",
          "receive data you provided in a portable format;",
          "object to processing based on our legitimate interests;",
          "withdraw consent at any time, where processing is based on consent."
        ),
        p(
          `To exercise a right, email ${CONTACT_EMAIL}. We will reply within one month, and may need to confirm your identity first. If your request concerns content that a customer company controls, we may refer it to that company.`
        ),
        p(
          "You may also complain to the Bulgarian supervisory authority: Commission for Personal Data Protection, 2 Prof. Tsvetan Lazarov Blvd., Sofia 1592, https://cpdp.bg, or to the authority in the EU country where you live or work."
        ),
      ],
    },
    {
      id: "children",
      title: "11. Children",
      blocks: [
        p(
          "The Service is intended for business use and is not directed at children. If you believe a child has given us personal data, please contact us and we will delete it."
        ),
      ],
    },
    {
      id: "changes",
      title: "12. Changes to this policy",
      blocks: [
        p(
          "We may update this policy when the Service or the law changes. The date at the top of this page shows the latest version. If a change significantly affects you, we will let you know through the Service or by email."
        ),
      ],
    },
  ],
};

const bg: PrivacyPolicy = {
  title: "Политика за поверителност",
  intro:
    "Тази политика обяснява как „Лудогорие софт“ ЕООД обработва лични данни, когато посещавате или използвате уеб приложението New Post („Услугата“). Тя е изготвена в съответствие с Регламент (ЕС) 2016/679 (GDPR) и Закона за защита на личните данни.",
  lastUpdatedLabel: "Последна актуализация",
  contentsLabel: "Съдържание",
  sections: [
    {
      id: "controller",
      title: "1. Кой отговаря за Вашите данни",
      blocks: [
        p("Администратор на лични данни е:"),
        list(
          "Организация: „Лудогорие софт“ ЕООД",
          "ЕИК: 206929451",
          "Адрес: гр. Разград, ул. „Бузлуджа“ 2, стая 506",
          "МОЛ: Емилиян Кадийски",
          `Имейл: ${CONTACT_EMAIL}`
        ),
        p(
          "Когато фирма клиент използва Услугата, за да подготвя собствено съдържание за социалните мрежи, тази фирма решава какво да въведе и публикува. Доколкото това съдържание включва лични данни, фирмата клиент е администратор, а ние ги обработваме от нейно име."
        ),
      ],
    },
    {
      id: "data",
      title: "2. Какви данни обработваме",
      blocks: [
        list(
          "Данни за профила: Вашето име, имейл адрес, хеш на паролата (никога самата парола), предпочитан език, предпочитан AI модел и статус на потвърждение на имейла.",
          "Членство във фирми: фирмите, към които принадлежите, ролята Ви във всяка от тях (собственик или редактор) и кой Ви е поканил.",
          "Записи за дейността: кой и кога е генерирал, редактирал, одобрил, отхвърлил или публикувал публикация, история на версиите и одитен журнал на действията в Услугата.",
          "Съдържание, което предоставяте: насоки за марката, текстове на публикации, бележки, източници на съдържание, информация за конкуренти и качени изображения. Личните данни, които включите в това съдържание, се обработват заедно с него.",
          "Записи за AI генериране: промпти, входни и изходни данни от AI операциите, съхранявани, за да може да се проследи произходът на дадена публикация.",
          "Данни за свързване на социални канали: идентификатор на Вашия акаунт в Buffer, имена на свързаните социални профили, криптирани идентификационни данни за достъп и показатели за ангажираност на публикуваните публикации.",
          "Публично достъпно съдържание: статии, обяви и страници или емисии на конкуренти, които клиент е задал като източник. В тях случайно може да се съдържат имена на хора.",
          "Технически данни: при посещение на Услугата нашият хостинг доставчик обработва в сървърните си логове Вашия IP адрес, данни за браузъра и за заявката. Самото приложение не съхранява IP адреса Ви."
        ),
      ],
    },
    {
      id: "purposes",
      title: "3. Защо ги обработваме и на какво правно основание",
      blocks: [
        table(
          ["Цел", "Правно основание (чл. 6, пар. 1 от GDPR)"],
          [
            [
              "Създаване и поддържане на Вашия профил, вход в системата и потвърждение на имейл адреса",
              "Изпълнение на договор, б. „б“",
            ],
            [
              "Предоставяне на Услугата: генериране, преглед, планиране и публикуване на публикации, както и отчитане на резултатите им",
              "Изпълнение на договор, б. „б“",
            ],
            [
              "Защита на Услугата, водене на одитни записи, предотвратяване на злоупотреби и отстраняване на грешки",
              "Законен интерес, б. „е“",
            ],
            [
              "Обработване на публично достъпни източници, зададени от клиент",
              "Законен интерес, б. „е“",
            ],
            ["Отговаряне на Ваши запитвания", "Законен интерес, б. „е“"],
            [
              "Изпълнение на счетоводни, данъчни и други законови задължения",
              "Законово задължение, б. „в“",
            ],
          ]
        ),
        p(
          "Предоставяте данните за профила, за да получите достъп. Без тях не можем да Ви създадем профил. За разглеждане на тази страница не е необходим профил."
        ),
      ],
    },
    {
      id: "ai",
      title: "4. Обработване с изкуствен интелект",
      blocks: [
        p(
          "Услугата използва изкуствен интелект, за да превежда и класифицира статии от източници и да създава текстове и изображения за публикации. Изпращаното за тази цел съдържание включва информация за фирмата и марката, изходни материали и инструкции. Имейлът и паролата на профила Ви не се включват. Моля, не въвеждайте лични данни в промпти, насоки за марката или източници, освен ако това не е необходимо."
        ),
        p(
          "Не използваме изкуствен интелект за вземане на решения относно физически лица, които пораждат правни или подобни значими последици за тях. Резултатите от AI се отнасят само до маркетингово съдържание."
        ),
      ],
    },
    {
      id: "recipients",
      title: "5. Кой получава Вашите данни",
      blocks: [
        p(
          "Не продаваме лични данни. Споделяме ги само с доставчици на услуги, които действат от наше име, и само доколкото всеки от тях се нуждае от тях. В зависимост от използваната конфигурация това са:"
        ),
        table(
          ["Доставчик", "Роля"],
          [
            ["Vercel", "Хостинг на приложението и сървърни логове"],
            ["Neon", "Хостинг на базата данни"],
            ["Brevo", "Изпращане на имейли за потвърждение на профила"],
            ["Buffer", "Публикуване в социалните мрежи и извличане на показатели"],
            ["Cloudinary", "Съхранение и доставка на изображения"],
            ["Anthropic, OpenAI, Groq", "Генериране на текст с AI"],
            ["Ideogram, fal.ai, OpenAI, Leonardo.ai", "Генериране на изображения с AI"],
          ]
        ),
        p(
          "Част от обработването с AI се извършва на инфраструктура, управлявана от нас, а не от трета страна. Съдържанието, което решите да публикувате, става видимо в съответните социални мрежи, които го обработват според собствените си политики. Можем да разкрием данни и когато законът го изисква. Другите членове на фирма, към която принадлежите, виждат името Ви и дейността Ви в рамките на тази фирма."
        ),
      ],
    },
    {
      id: "transfers",
      title: "6. Предаване извън ЕИП",
      blocks: [
        p(
          "Някои от тези доставчици са установени или обработват данни в държави извън Европейското икономическо пространство, включително Съединените щати. Когато не е налице решение на Европейската комисия за адекватно ниво на защита, каквото е Рамката за защита на данните между ЕС и САЩ за сертифицираните получатели, разчитаме на подходящи гаранции като стандартните договорни клаузи на Комисията. Можете да поискате подробности на посочения по-горе имейл."
        ),
      ],
    },
    {
      id: "retention",
      title: "7. Колко дълго съхраняваме данните",
      blocks: [
        list(
          "Данни за профила, членството и дейността: докато съществува профилът Ви. След изтриването му ги заличаваме или анонимизираме, освен ако са ни необходими за целите по-долу.",
          "Съдържание на фирмата, история на публикациите и записи за AI генериране: докато фирмата използва Услугата, освен ако бъдат изтрити по-рано от нея или по нейно искане.",
          "Идентификационни данни за социални канали: до премахване на връзката.",
          "Токени за потвърждение на имейл: валидни са 24 часа и се заменят при издаване на нов.",
          "Данни, необходими за счетоводни цели или правни претенции: за срока, определен от закона, или до приключване на спора.",
          "Сървърни логове на хостинга: за срока, определен от хостинг доставчика."
        ),
      ],
    },
    {
      id: "cookies",
      title: "8. Бисквитки",
      blocks: [
        p(
          "Използваме само бисквитки, необходими за работата на Услугата и за запомняне на Вашия избор. Не използваме рекламни или аналитични бисквитки, затова не изискваме съгласие за бисквитки."
        ),
        table(
          ["Бисквитка", "Предназначение", "Срок"],
          [
            ["authjs.session-token", "Поддържа входа Ви в системата", "До 30 дни"],
            ["authjs.csrf-token", "Защитава входа от фалшифицирани заявки", "Сесия на браузъра"],
            [
              "authjs.callback-url",
              "Връща Ви на правилната страница след вход",
              "Сесия на браузъра",
            ],
            ["NEXT_LOCALE", "Запомня езика Ви", "1 година"],
            ["active_company", "Запомня последно избраната от Вас фирма", "1 година"],
          ]
        ),
        p(
          "При защитени връзки имената на бисквитките за удостоверяване може да започват с „__Secure-“ или „__Host-“."
        ),
      ],
    },
    {
      id: "security",
      title: "9. Сигурност",
      blocks: [
        p(
          "Прилагаме технически и организационни мерки, съобразени с риска. Те включват криптирани връзки, еднопосочно хеширане на паролите, криптиране при съхранение на идентификационните данни за социални канали и достъп според ролята във всяка фирма. Никоя система не е напълно сигурна, затова използвайте силна и уникална парола."
        ),
      ],
    },
    {
      id: "rights",
      title: "10. Вашите права",
      blocks: [
        p("Съгласно GDPR имате право:"),
        list(
          "на достъп до личните си данни и на копие от тях;",
          "на коригиране на неточни данни;",
          "на изтриване на данните, включително на профила Ви;",
          "на ограничаване на обработването в определени случаи;",
          "да получите предоставените от Вас данни в преносим формат;",
          "на възражение срещу обработване, основано на наш законен интерес;",
          "да оттеглите съгласието си по всяко време, когато обработването се основава на съгласие."
        ),
        p(
          `За да упражните свое право, пишете на ${CONTACT_EMAIL}. Ще отговорим в срок до един месец, като може първо да се наложи да потвърдим самоличността Ви. Ако искането се отнася до съдържание под контрола на фирма клиент, може да го препратим към тази фирма.`
        ),
        p(
          "Можете да подадете жалба и до българския надзорен орган: Комисия за защита на личните данни, гр. София 1592, бул. „Проф. Цветан Лазаров“ 2, https://cpdp.bg, или до органа в държавата от ЕС, в която живеете или работите."
        ),
      ],
    },
    {
      id: "children",
      title: "11. Деца",
      blocks: [
        p(
          "Услугата е предназначена за бизнес употреба и не е насочена към деца. Ако смятате, че дете ни е предоставило лични данни, моля, свържете се с нас и ще ги изтрием."
        ),
      ],
    },
    {
      id: "changes",
      title: "12. Промени в тази политика",
      blocks: [
        p(
          "Можем да актуализираме тази политика при промяна на Услугата или на законодателството. Датата в началото на страницата показва последната версия. Ако промяна Ви засяга съществено, ще Ви уведомим чрез Услугата или по имейл."
        ),
      ],
    },
  ],
};

export const PRIVACY_POLICY: Record<"en" | "bg", PrivacyPolicy> = { en, bg };
