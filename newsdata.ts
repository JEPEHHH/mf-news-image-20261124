/**
 * THE WORLD — the copy desk, Monday 24 November 2026.
 *
 * Every word and every figure that reaches the page comes from this module: the
 * lead package, the three sidebar stories, the four briefs in the black band, and
 * the forty-three item expanded file at the foot. Nothing here knows about
 * pixels — no sizes, no coordinates, no colours — so the edition can be re-set at
 * another page measure without touching a word.
 *
 * The rules the copy keeps to:
 *   lead       headline, deck, one story, a caption and its credit
 *   sidebar    kicker, headline, body, and which artwork (if any) sits under it
 *   ticker     region, one sentence, four of them in a two by two grid
 *   briefs43   one section word, a headline of forty-two characters or fewer, and
 *              one or two sentences carrying a single concrete figure. Nothing
 *              here repeats the sidebar stories or the four briefs above it.
 */

/* =============================================================== the lead == */

export const LEAD_HEAD = "G20 CLOSES WITH A THIN DEAL ON DEBT";
export const LEAD_DECK = "A thin compromise on poor-country debt leaves hard cuts until June.";

export const LEAD_BODY =
  "The gavel came down at 4:40am. The communique binds 38 governments to a 90-day standstill and asks the fund to " +
  "report on 84 billion dollars of claims by June. Aid groups called the deal thin, and no private creditor is bound to take a loss.";

export const LEAD_CAP = "The closing session ran into a second night.";
export const LEAD_CREDIT = "PHOTOGRAPH: THE WORLD";

/* ============================================================ the sidebar == */

export type SideItem = {
  kicker: string;
  head: string;
  body: string;
  art: "capitol" | "ship" | "chart" | "none";
  artH: number;
  caption: string;
  credit: string;
};

export const SIDE_ITEMS: SideItem[] = [
  {
    kicker: "ENERGY",
    head: "GRID OPERATORS AGREE A WINTER PLAN",
    body: "Eight transmission operators will share reserve power across borders this winter, a deal they value at 2.4 billion dollars. Regulators must approve it before December.",
    art: "none", artH: 0,
    caption: "",
    credit: "",
  },
  {
    kicker: "EUROPE",
    head: "BRUSSELS FINES THREE CEMENT GROUPS",
    body: "The commission ordered 640 million euros in penalties for fixing prices in eight member states. The companies said they will appeal.",
    art: "none", artH: 0,
    caption: "",
    credit: "",
  },
  {
    kicker: "DEMOGRAPHY",
    head: "ISLAM TO PASS CHRISTIANITY",
    body: "A report projects Islam as the largest faith in the world by 2035.",
    art: "chart", artH: 198,
    caption: "",
    credit: "PROJECTION: THE WORLD DESK",
  },
];

/* ============================================================= the ticker == */

export type TickerItem = { reg: string; txt: string };

export const TICKER: TickerItem[] = [
  { reg: "UKRAINE", txt: "An overnight attack on the Kyiv region left two dead and four wounded, local officials said. Air defences stayed busy until dawn." },
  { reg: "WEST BANK", txt: "Settlers attacked Palestinian villages across the occupied West Bank late on Sunday, residents and medics reported." },
  { reg: "HAITI", txt: "Two Salvadoran soldiers on a security mission were killed and two were wounded in the country, the army said." },
  { reg: "CHINA", txt: "Beijing set 2030 targets for elderly care and for childcare places across the country, as the population ages." },
];

/* ======================================================== the expanded file == */

export type Brief43 = { section: string; head: string; body: string };

export const BRIEFS43: Brief43[] = [
  /* ------------------------------------------------------------------ WORLD */
  {
    section: "WORLD",
    head: "GRAIN CORRIDOR TALKS REOPEN IN GENEVA",
    body: "Negotiators from four states met for a third day on a shipping corridor for grain. The present deal expires on 12 December.",
  },
  {
    section: "WORLD",
    head: "RELIEF CONVOY VOTE SLIPS TO FRIDAY",
    body: "The security council postponed a vote on cross-border aid for a fourth time. Agencies say 6.2 million people depend on the route.",
  },
  {
    section: "WORLD",
    head: "COURT ORDERS TWO REPORTERS RELEASED",
    body: "A regional court freed two journalists held since August, ruling the charges unproven. Both walked out after 96 days.",
  },
  {
    section: "WORLD",
    head: "BORDER PATROL TALKS RESUME AFTER PAUSE",
    body: "Envoys returned to the table with a narrow agenda on patrols and observers. Officials called the 14 hours of talks technical.",
  },
  {
    section: "WORLD",
    head: "SAHEL BLOC SETS A JOINT PASSPORT DATE",
    body: "Five member states will issue one shared travel document from 1 March. The bloc counts 21 million citizens.",
  },
  /* ----------------------------------------------------------------- EUROPE */
  {
    section: "EUROPE",
    head: "RIGA NAMES A COALITION AFTER 11 DAYS",
    body: "Three parties agreed a programme that cuts the deficit to 2.8 percent of output. The confidence vote is set for Thursday.",
  },
  {
    section: "EUROPE",
    head: "FRANCE TRIMS ITS DEFENCE BILL FOR 2027",
    body: "The budget adds 3.1 billion euros for munitions and drones, less than the army requested. Deputies vote next week.",
  },
  {
    section: "EUROPE",
    head: "MADRID AND LISBON LINK THEIR GRIDS",
    body: "A second interconnector carrying 1.5 gigawatts entered service on Sunday. Operators called it the largest in a decade.",
  },
  {
    section: "EUROPE",
    head: "POLAND REOPENS A CROSSING TO BELARUS",
    body: "Freight resumed at the Terespol gate after nine weeks of closure. The queue stood at 1,400 trucks by midday.",
  },
  /* ------------------------------------------------------------------- ASIA */
  {
    section: "ASIA",
    head: "JAPAN APPROVES A 21 TRILLION YEN PACKAGE",
    body: "The cabinet agreed subsidies for fuel, rice and household power bills. The package equals 3.4 percent of output.",
  },
  {
    section: "ASIA",
    head: "INDIA OPENS A DEEPWATER TERMINAL",
    body: "Container handling began at a new berth of 1.2 km on the Andhra coast. Officials expect a million boxes a year.",
  },
  {
    section: "ASIA",
    head: "SEOUL RAISES ITS CHIP SUBSIDY CEILING",
    body: "The government doubled tax credits for memory plants to 25 percent. Two makers pledged 4 trillion won of new lines.",
  },
  {
    section: "ASIA",
    head: "PAKISTAN AND THE FUND REACH A STAFF DEAL",
    body: "The agreement unlocks 1.1 billion dollars once the board meets in December. Retail power tariffs rise 6 percent.",
  },
  /* ----------------------------------------------------------------- AFRICA */
  {
    section: "AFRICA",
    head: "KENYA CUTS ITS FUEL LEVY BY A THIRD",
    body: "The levy falls to 5.4 shillings a litre from midnight on Monday. Pump prices should ease within a week.",
  },
  {
    section: "AFRICA",
    head: "NIGERIA CLEARS A LONG-DELAYED VOTE BILL",
    body: "Lawmakers passed rules allowing electronic result sheets nationwide. The president has 30 days to sign or refuse.",
  },
  {
    section: "AFRICA",
    head: "MOROCCO TRIPLES ITS HYDROGEN TARGET",
    body: "The energy ministry raised the 2030 export goal to 900,000 tonnes a year. Two plants already hold offtake deals.",
  },
  /* --------------------------------------------------------------- AMERICAS */
  {
    section: "AMERICAS",
    head: "BRAZIL SENATE BACKS A NEW FISCAL RULE",
    body: "The rule caps spending growth at 2.5 percent above inflation. The lower house votes on Wednesday.",
  },
  {
    section: "AMERICAS",
    head: "MEXICO OPENS A REGISTER OF THE MISSING",
    body: "The new list carries 118,000 open cases and names 340 officials to review them. Families welcomed it with caution.",
  },
  {
    section: "AMERICAS",
    head: "CHILE SETS A LITHIUM ROYALTY FLOOR",
    body: "The levy starts at 8 percent of sales at the mine gate. Two operators have filed for arbitration.",
  },
  {
    section: "AMERICAS",
    head: "CANADA BUYS 12 FIREFIGHTING AIRCRAFT",
    body: "Ottawa ordered the planes for delivery by 2029 at 1.6 billion dollars. Wildfires burned a record area this summer.",
  },
  /* --------------------------------------------------------------- BUSINESS */
  {
    section: "BUSINESS",
    head: "A LESSOR SPLITS A 120-JET ORDER",
    body: "An Asian leasing firm divided the narrowbody purchase between the two big makers. Deliveries run from 2028 to 2032.",
  },
  {
    section: "BUSINESS",
    head: "A STEEL TIE-UP CLEARS ITS LAST HURDLE",
    body: "Regulators allowed the merger after two mills were sold to a rival. The group will hold 19 percent of output.",
  },
  {
    section: "BUSINESS",
    head: "RETAIL VOLUMES FALL FOR A FOURTH MONTH",
    body: "Sales slipped 0.6 percent in October, statistics offices reported. Discount chains gained share for the ninth month.",
  },
  {
    section: "BUSINESS",
    head: "A CARRIER ADDS A 210 DOLLAR SURCHARGE",
    body: "The line imposes 210 dollars a box on Asia-Europe routes from 1 December. Transit times lengthen by nine days.",
  },
  {
    section: "BUSINESS",
    head: "THE DOLLAR SLIPS AS BOND YIELDS EASE",
    body: "The currency fell 0.8 percent against a basket of peers. Ten-year yields touched 3.9 percent in London.",
  },
  /* ----------------------------------------------------------------- ENERGY */
  {
    section: "ENERGY",
    head: "OPEC LEAVES QUOTAS ALONE UNTIL MARCH",
    body: "Ministers kept the group target at 40.2 million barrels a day. A monitoring committee meets again in March.",
  },
  {
    section: "ENERGY",
    head: "A NORTH SEA FIELD STARTS PHASE TWO",
    body: "The operator began pumping from two new wells, adding 22,000 barrels a day. Costs ran 11 percent over budget.",
  },
  {
    section: "ENERGY",
    head: "COPPER CLOSES AT A FOUR-MONTH HIGH",
    body: "The metal settled at 9,840 dollars a tonne on grid and cable demand. Exchange stocks fell a sixth week.",
  },
  /* ------------------------------------------------------------------- TECH */
  {
    section: "TECH",
    head: "A CHIPMAKER DELAYS ITS 2NM PLANT",
    body: "Tool installation slips to the third quarter of 2027, the company said. It still targets 20,000 wafers a month.",
  },
  {
    section: "TECH",
    head: "BRUSSELS PROBES AD FEE TRANSPARENCY",
    body: "The commission asked five platforms for contracts covering 61 percent of display spending. Replies are due in 30 days.",
  },
  {
    section: "TECH",
    head: "A SATELLITE OPERATOR LOSES TWO CRAFT",
    body: "Both units failed within 40 minutes of a launch on Saturday. The firm still keeps 118 satellites in orbit.",
  },
  {
    section: "TECH",
    head: "AN OPEN MODEL SHIPS 70 BILLION WEIGHTS",
    body: "The lab published 70 billion parameters under a permissive research licence. Early tests put it 4 points behind a closed rival.",
  },
  /* ---------------------------------------------------------------- CLIMATE */
  {
    section: "CLIMATE",
    head: "GLACIER SURVEY FINDS A THIRD YEAR OF LOSS",
    body: "Monitors measured 2.4 metres of ice lost on average across 20 sites. The series now runs 44 years.",
  },
  {
    section: "CLIMATE",
    head: "A DELTA CITY RAISES ITS SEA WALL",
    body: "Work starts in January along 9 km of frontage. The bill is put at 480 million dollars over six years.",
  },
  {
    section: "CLIMATE",
    head: "CARBON PRICES SLIP BELOW 60 EUROS",
    body: "The benchmark fell to 58.70 euros a tonne, its lowest since spring. Utilities sold permits into a mild forecast.",
  },
  /* ----------------------------------------------------------------- HEALTH */
  {
    section: "HEALTH",
    head: "A MALARIA SHOT REACHES 12 MORE STATES",
    body: "Health ministries added the vaccine to routine schedules for 4.1 million infants. Supply is the binding constraint.",
  },
  {
    section: "HEALTH",
    head: "HOSPITAL WAIT LISTS FALL BY 210,000",
    body: "The backlog dropped in a single quarter, the health service said. Cancer referrals rose 3 percent over the year.",
  },
  {
    section: "HEALTH",
    head: "A CHOLERA OUTBREAK PROMPTS A DRIVE",
    body: "Officials began an oral vaccine campaign for 640,000 people after 1,900 suspected cases. Clean water is scarce.",
  },
  /* ------------------------------------------------------------------ SPORT */
  {
    section: "SPORT",
    head: "A RECORD FIELD ENTERS THE SPRING RACE",
    body: "Organisers confirmed 46,000 runners for the April marathon start. The elite list holds four men under 2:04.",
  },
  {
    section: "SPORT",
    head: "TWO CLUBS AGREE A STADIUM SHARE DEAL",
    body: "The sides will split 30 home dates from August, ending a 12-year dispute. Tickets go on sale in May.",
  },
  {
    section: "SPORT",
    head: "A SWIMMER BREAKS THE 200M FREE MARK",
    body: "The 19-year-old touched in 1:42.61 at a short-course meet on Sunday. The old mark stood for 11 months.",
  },
  /* ---------------------------------------------------------------- CULTURE */
  {
    section: "CULTURE",
    head: "A MUSEUM RETURNS 24 BRONZES TO LAGOS",
    body: "The 24 pieces arrive in February on a five-year loan. Officials on both sides called the terms renewable.",
  },
  {
    section: "CULTURE",
    head: "A LOST FILM SCREENS AFTER 71 YEARS",
    body: "Archivists restored 92 minutes from a nitrate print found in 2023. It opens in three cities on Friday.",
  },
];
