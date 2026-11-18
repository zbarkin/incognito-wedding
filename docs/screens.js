// The list of screens in the preview, shared by the main page and the
// picker shown on each screen when it's opened on its own.
// Each entry: [link id, design file name, menu name, one-line note, phone screen?]
window.SCREEN_GROUPS = [
  ['For the client', [
    ['present', 'Present', 'Style options · presentation', 'Walk through each style path, or compare them side by side']
  ]],
  ['Silver Birch path', [
    ['birch-party', 'BirchParty', 'Silver Birch · the party', 'Step 2'],
    ['birch-look', 'BirchLook', 'Silver Birch · the look', 'Step 3'],
    ['birch-book', 'BirchBook', 'Silver Birch · book a visit', 'Step 4'],
    ['birch-status', 'BirchStatus', 'Silver Birch · party status', 'The groom’s view'],
    ['birch-member', 'BirchMember', 'Silver Birch · groomsman', 'Phone', true]
  ]],
  ['Tuxedo Park path', [
    ['park-party', 'ParkParty', 'Tuxedo Park · the party', 'Step 2'],
    ['park-look', 'ParkLook', 'Tuxedo Park · the look', 'Step 3'],
    ['park-book', 'ParkBook', 'Tuxedo Park · book a visit', 'Step 4'],
    ['park-status', 'ParkStatus', 'Tuxedo Park · party status', 'The groom’s view'],
    ['park-member', 'ParkMember', 'Tuxedo Park · groomsman', 'Phone', true]
  ]],
  ['Style options · sign-up step 1', [
    ['kodak', 'Main', 'Kodak', 'Charcoal, brass and brushed aluminum, with a Rochester feel'],
    ['silver-birch', 'SilverBirchSignup', 'Silver Birch', 'Black, silver and ivory, with Cesso for titles'],
    ['tuxedo-park-green', 'TuxedoParkSignup', 'Tuxedo Park · green', 'Bottle-green walls, engraved stationery and gilt'],
    ['tuxedo-park-burgundy', 'TuxedoParkBurgundySignup', 'Tuxedo Park · burgundy', 'The Tuxedo Park burgundy set'],
    ['kodak-kit', 'KodakKit', 'Kodak component kit · first pass', 'The first, more playful take; the screens now use a sleeker version']
  ]],
  ['Prom', [
    ['prom-kodak', 'PromKodak', 'Prom · Kodak, the squad', 'Prom crew sign-up in the Kodak style: a 1970s city detective, armed with a camera'],
    ['prom-silver-birch', 'PromBirch', 'Prom · Silver Birch, the agent', 'Prom crew sign-up in the Silver Birch style: a secret-agent mission briefing'],
    ['prom-silver-birch-miami', 'PromBirchMiami', 'Prom · Silver Birch, Miami nights (alternate)', 'An alternate Silver Birch prom sign-up: Miami modern, neon pink, purple and turquoise, with car details'],
    ['prom-tuxedo-park', 'PromPark', 'Prom · Tuxedo Park, the detective', 'Prom crew sign-up in the Tuxedo Park style: a Victorian consulting detective'],
    ['prom-look-kodak', 'PromStyleKodak', 'Prom look · Kodak', 'Browse the inventory and pick the look, matched to your date'],
    ['prom-look-silver-birch', 'PromStyleBirch', 'Prom look · Silver Birch', 'Choose your cover: the inventory as an agent’s wardrobe'],
    ['prom-look-tuxedo-park', 'PromStylePark', 'Prom look · Tuxedo Park', 'Examine the wardrobe: the inventory as a case'],
    ['prom-measure-kodak', 'PromMeasureKodak', 'Prom measurements · Kodak', 'Online measurements with a how-to for each'],
    ['prom-measure-silver-birch', 'PromMeasureBirch', 'Prom measurements · Silver Birch', 'File your intel: online measurements'],
    ['prom-measure-tuxedo-park', 'PromMeasurePark', 'Prom measurements · Tuxedo Park', 'Gather the evidence: online measurements'],
    ['suit-up-kodak', 'PromGameKodak', 'Suit Up game · Kodak', 'Minigame: dress the form in the right order against the clock'],
    ['suit-up-silver-birch', 'PromGameBirch', 'Suit Up game · Silver Birch', 'Minigame: the mission version'],
    ['suit-up-tuxedo-park', 'PromGamePark', 'Suit Up game · Tuxedo Park', 'Minigame: the case-file version'],
    ['suit-up-art', 'SuitUpArt', 'Suit Up art test', 'Your drawings in each style, next to the current game art']
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
    ['staff-today', 'StaffToday', 'Today', 'The day at a glance: appointments, to-dos before close, replies'],
    ['staff-parties', 'Parties', 'All parties', 'The staff board: every wedding and what needs attention'],
    ['staff-party', 'PartyAdmin', 'Assess one party', 'One wedding in detail, with automatic measurement checks and messages'],
    ['staff-appointments', 'StaffAppointments', 'Appointments', 'The week’s calendar, with check-in and reminders'],
    ['staff-orders', 'StaffOrders', 'Orders', 'Rental warehouse orders, from waiting on the party to checked in'],
    ['staff-pickups', 'StaffPickups', 'Pickups & returns', 'The counter: hand-offs with a checklist, returns with condition check-in'],
    ['staff-customers', 'StaffCustomers', 'Customers', 'Everyone who’s rented or bought, with sizes and history']
  ]],
  ['Shop', [
    ['shop', 'Shop', 'The shop · Kodak', 'Every suit and dinner jacket to buy, on a retro chrome stand (checkout not connected yet)'],
    ['shop-silver-birch', 'ShopBirch', 'The shop · Silver Birch', 'The collection on a modern faceted mannequin'],
    ['shop-tuxedo-park', 'ShopPark', 'The shop · Tuxedo Park', 'The wardrobe on a classic wooden dress form']
  ]]
];
