// The list of screens in the preview, shared by the main page and the
// picker shown on each screen when it's opened on its own.
// Each entry: [link id, design file name, menu name, one-line note, phone screen?]
window.SCREEN_GROUPS = [
  ['Style options · sign-up step 1', [
    ['kodak', 'Main', 'Kodak', 'Charcoal, brass and brushed aluminum, with a Rochester feel'],
    ['silver-birch', 'SilverBirchSignup', 'Silver Birch', 'Black, silver and ivory, with Cesso for titles'],
    ['tuxedo-park-green', 'TuxedoParkSignup', 'Tuxedo Park · green', 'Bottle-green walls, engraved stationery and gilt'],
    ['tuxedo-park-burgundy', 'TuxedoParkBurgundySignup', 'Tuxedo Park · burgundy', 'The Tuxedo Park burgundy set']
  ]],
  ['Prom', [
    ['prom-kodak', 'PromKodak', 'Prom · Kodak, the squad', 'Prom crew sign-up in the Kodak style: a 1970s city detective, armed with a camera'],
    ['prom-silver-birch', 'PromBirch', 'Prom · Silver Birch, the agent', 'Prom crew sign-up in the Silver Birch style: a secret-agent mission briefing'],
    ['prom-tuxedo-park', 'PromPark', 'Prom · Tuxedo Park, the detective', 'Prom crew sign-up in the Tuxedo Park style: a Victorian consulting detective'],
    ['suit-up-kodak', 'PromGameKodak', 'Suit Up game · Kodak', 'Minigame: dress the form in the right order against the clock'],
    ['suit-up-silver-birch', 'PromGameBirch', 'Suit Up game · Silver Birch', 'Minigame: the mission version'],
    ['suit-up-tuxedo-park', 'PromGamePark', 'Suit Up game · Tuxedo Park', 'Minigame: the case-file version']
  ]],
  ['Style details', [
    ['silver-birch-details', 'SilverBirch', 'Silver Birch · detail components', 'The small parts of the Silver Birch style'],
    ['tuxedo-park-green-details', 'TuxedoPark', 'Tuxedo Park green · detail components', 'The small parts of Tuxedo Park, green'],
    ['tuxedo-park-burgundy-details', 'TuxedoParkBurgundy', 'Tuxedo Park burgundy · detail components', 'The small parts of Tuxedo Park, burgundy']
  ]],
  ['Register the wedding party (Kodak style)', [
    ['step-1', 'Main', '1 · The wedding', 'Sign-up step 1: names, date and venue'],
    ['step-2', 'Party', '2 · The party', 'Sign-up step 2: who needs a tux or suit'],
    ['step-3', 'Look', '3 · The look', 'Sign-up step 3: tuxedo or suit, color and details'],
    ['step-4', 'Book', '4 · Book a visit', 'Sign-up step 4: pick a time to come in']
  ]],
  ['Track the party', [
    ['status', 'Status', 'Party status · groom’s view', 'Where the whole party stands, three weeks after sign-up'],
    ['groomsman', 'Member', 'Groomsman’s page · phone', 'What a groomsman sees from his invite link', 1],
    ['measurements', 'Measure', 'Measurements form · phone', 'Entering measurements, with a how-to behind every How? link', 1],
    ['walkthrough', 'Guide', 'Measuring walkthrough · phone', 'One measurement at a time, with an animation for each', 1]
  ]],
  ['How to measure', [
    ['animations', 'Library', 'All 10 measuring animations', 'Every how-to-measure animation on one page']
  ]],
  ['Staff', [
    ['staff-parties', 'Parties', 'All parties', 'The staff board: every wedding and what needs attention'],
    ['staff-party', 'PartyAdmin', 'Assess one party', 'One wedding in detail, with automatic measurement checks']
  ]]
];
