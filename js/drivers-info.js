// ============================================================
// DRIVERS / TEAMS INFO — Datos fijos de pilotos y equipos
// Cambia solo cuando cambia un piloto/equipo (inicio de temporada).
// ============================================================

// ============ DRIVERS INFO (datos fijos) ============
const DRIVERS_INFO={
"VER":{name:"Max Verstappen",nat:"Países Bajos",flag:"nl",num:1,dob:"1997-09-30",debut:2015,bio:"Campeón del mundo 2021, 2022, 2023 y 2024. Hijo de Jos Verstappen. Debutó con Toro Rosso en 2015 como el piloto más joven en la historia de F1."},
"HAM":{name:"Lewis Hamilton",nat:"Reino Unido",flag:"gb",num:44,dob:"1985-01-07",debut:2007,bio:"Siete veces campeón del mundo (2008, 2014-2020). Récord de victorias y poles en F1. Debutó con McLaren en 2007 y pasó a Ferrari en 2025."},
"LEC":{name:"Charles Leclerc",nat:"Mónaco",flag:"mc",num:16,dob:"1997-10-16",debut:2018,bio:"Debutó con Sauber en 2018. Piloto de Ferrari desde 2019. Ahijado de Jules Bianchi."},
"SAI":{name:"Carlos Sainz Jr.",nat:"España",flag:"es",num:55,dob:"1994-09-01",debut:2015,bio:"Hijo del bicampeón mundial de rally. Debutó con Toro Rosso en 2015. Pasó por Renault, McLaren, Ferrari y Williams."},
"NOR":{name:"Lando Norris",nat:"Reino Unido",flag:"gb",num:4,dob:"1999-11-13",debut:2019,bio:"Debutó con McLaren en 2019. Campeón del mundo 2025 tras una batalla histórica con Verstappen."},
"PIA":{name:"Oscar Piastri",nat:"Australia",flag:"au",num:81,dob:"2001-04-06",debut:2023,bio:"Campeón de F3 y F2 consecutivos. Debutó con McLaren en 2023 tras disputa contractual con Alpine."},
"RUS":{name:"George Russell",nat:"Reino Unido",flag:"gb",num:63,dob:"1998-02-15",debut:2019,bio:"Campeón de GP3 y F2. Debutó con Williams en 2019. Titular en Mercedes desde 2022."},
"ANT":{name:"Kimi Antonelli",nat:"Italia",flag:"it",num:12,dob:"2006-08-25",debut:2025,bio:"Juvenil de Mercedes desde los 12 años. Saltó de F4 a F2 directo. Reemplazó a Hamilton en Mercedes en 2025. Récord del polesitter más joven de F1."},
"ALO":{name:"Fernando Alonso",nat:"España",flag:"es",num:14,dob:"1981-07-29",debut:2001,bio:"Bicampeón del mundo (2005, 2006) con Renault. Debutó en 2001. Regresó a F1 en 2021 con Alpine; titular de Aston Martin desde 2023."},
"STR":{name:"Lance Stroll",nat:"Canadá",flag:"ca",num:18,dob:"1998-10-29",debut:2017,bio:"Debutó con Williams en 2017. Titular de Aston Martin (equipo propiedad de su padre Lawrence) desde 2021."},
"GAS":{name:"Pierre Gasly",nat:"Francia",flag:"fr",num:10,dob:"1996-02-07",debut:2017,bio:"Debutó con Toro Rosso en 2017. Ganó el GP de Italia 2020. Se mudó a Alpine en 2023."},
"OCO":{name:"Esteban Ocon",nat:"Francia",flag:"fr",num:31,dob:"1996-09-17",debut:2016,bio:"Debutó con Manor en 2016. Ganó el GP de Hungría 2021 con Alpine. En Haas desde 2025."},
"HUL":{name:"Nico Hülkenberg",nat:"Alemania",flag:"de",num:27,dob:"1987-08-19",debut:2010,bio:"Debutó con Williams en 2010. Logró su primer podio en F1 en el GP de Reino Unido 2025 con Sauber. Pasa a Audi en 2026."},
"BEA":{name:"Oliver Bearman",nat:"Reino Unido",flag:"gb",num:87,dob:"2005-05-08",debut:2024,bio:"Debutó como suplente con Ferrari en Arabia Saudita 2024. Titular de Haas desde 2025. El número 87 combina su cumpleaños (8/5) y el de su hermano (7/8)."},
"ALB":{name:"Alex Albon",nat:"Tailandia",flag:"th",num:23,dob:"1996-03-23",debut:2019,bio:"Nacido en Londres, corre con licencia tailandesa. Debutó con Toro Rosso en 2019. En Williams desde 2022."},
"COL":{name:"Franco Colapinto",nat:"Argentina",flag:"ar",num:43,dob:"2003-05-27",debut:2024,bio:"Primer argentino en F1 desde Gastón Mazzacane (2001). Debutó con Williams a mitad de 2024. Reemplazó a Doohan en Alpine a mitad de 2025."},
"HAD":{name:"Isack Hadjar",nat:"Francia",flag:"fr",num:6,dob:"2004-09-28",debut:2025,bio:"Nacido en París, de ascendencia franco-argelina. Subcampeón de F2 2024. Debutó con Racing Bulls en 2025. Ascendió a Red Bull en 2026."},
"BOR":{name:"Gabriel Bortoleto",nat:"Brasil",flag:"br",num:5,dob:"2004-10-14",debut:2025,bio:"Campeón de F3 2023 y F2 2024 como debutante. Representado por A14 (Fernando Alonso). Debutó con Sauber en 2025, continúa con Audi en 2026."},
"LAW":{name:"Liam Lawson",nat:"Nueva Zelanda",flag:"nz",num:30,dob:"2002-02-11",debut:2023,bio:"Debutó como suplente con AlphaTauri en 2023. Titular de Racing Bulls desde 2025 tras su paso frustrado por Red Bull."},
"TSU":{name:"Yuki Tsunoda",nat:"Japón",flag:"jp",num:22,dob:"2000-05-11",debut:2021,bio:"Primer piloto japonés en F1 desde Kamui Kobayashi. Debutó con AlphaTauri en 2021. Promovido a Red Bull a mitad de 2025."},
"LIN":{name:"Arvid Lindblad",nat:"Reino Unido",flag:"gb",num:41,dob:"2007-08-08",debut:2026,bio:"Británico con ascendencia sueca e india. El único rookie del grid 2026. Ganador más joven de la historia en F2 y F3."},
"BOT":{name:"Valtteri Bottas",nat:"Finlandia",flag:"fi",num:77,dob:"1989-08-28",debut:2013,bio:"Subcampeón del mundo con Mercedes (2019, 2020). Ganó 10 GPs. Pasó por Williams, Mercedes y Sauber. Titular de Cadillac en 2026."},
"PER":{name:"Sergio Pérez",nat:"México",flag:"mx",num:11,dob:"1990-01-26",debut:2011,bio:"Debutó con Sauber en 2011. Compañero de Verstappen en Red Bull (2021-2024). Regresa a F1 con Cadillac en 2026."},
"RIC":{name:"Daniel Ricciardo",nat:"Australia",flag:"au",num:3,dob:"1989-07-01",debut:2011,bio:"Ganó 8 GPs con Red Bull. Pasó por HRT, Toro Rosso, Red Bull, Renault, McLaren y AlphaTauri. Última carrera en Singapur 2024."},
"MAG":{name:"Kevin Magnussen",nat:"Dinamarca",flag:"dk",num:20,dob:"1992-10-05",debut:2014,bio:"Debutó con McLaren y subió al podio en su primera carrera. Pasó por Renault, Haas (en dos etapas). Su última temporada completa fue 2024."},
"VET":{name:"Sebastian Vettel",nat:"Alemania",flag:"de",num:5,dob:"1987-07-03",debut:2007,bio:"Tetracampeón del mundo (2010-2013) con Red Bull. Ganó 53 GPs. Se retiró a fines de 2022 tras su paso por Aston Martin."},
"RAI":{name:"Kimi Räikkönen",nat:"Finlandia",flag:"fi",num:7,dob:"1979-10-17",debut:2001,bio:"Campeón del mundo 2007 con Ferrari. Ganó 21 GPs. Se retiró a fines de 2021 tras su paso final por Alfa Romeo."},
"GIO":{name:"Antonio Giovinazzi",nat:"Italia",flag:"it",num:99,dob:"1993-12-14",debut:2017,bio:"Corrió con Alfa Romeo entre 2019 y 2021. Posteriormente siguió carrera en WEC con Ferrari."},
"MAZ":{name:"Nikita Mazepin",nat:"Rusia",flag:"ru",num:9,dob:"1999-03-02",debut:2021,bio:"Corrió una única temporada en F1 con Haas en 2021. Su contrato fue rescindido tras la invasión rusa a Ucrania en 2022."},
"MSC":{name:"Mick Schumacher",nat:"Alemania",flag:"de",num:47,dob:"1999-03-22",debut:2021,bio:"Hijo de Michael Schumacher. Campeón de F2 2020. Corrió con Haas en 2021 y 2022."},
"KUB":{name:"Robert Kubica",nat:"Polonia",flag:"pl",num:88,dob:"1984-12-07",debut:2006,bio:"Ganador del GP de Canadá 2008. Regresó como suplente de Alfa Romeo en 2021 tras su accidente de rally de 2011."},
"LAT":{name:"Nicholas Latifi",nat:"Canadá",flag:"ca",num:6,dob:"1995-06-29",debut:2020,bio:"Corrió con Williams entre 2020 y 2022. Su accidente en Abu Dhabi 2021 marcó un hito histórico."},
"ZHO":{name:"Zhou Guanyu",nat:"China",flag:"cn",num:24,dob:"1999-05-30",debut:2022,bio:"Primer piloto chino en la historia de F1. Corrió con Alfa Romeo/Sauber entre 2022 y 2024."},
"DEV":{name:"Nyck de Vries",nat:"Países Bajos",flag:"nl",num:21,dob:"1995-02-06",debut:2022,bio:"Campeón de F2 2019 y de Fórmula E 2021. Corrió con AlphaTauri en 2023 antes de ser reemplazado por Ricciardo."},
"SAR":{name:"Logan Sargeant",nat:"Estados Unidos",flag:"us",num:2,dob:"2000-12-31",debut:2023,bio:"Primer piloto estadounidense en F1 desde Scott Speed. Corrió con Williams en 2023 y parte de 2024."},
"DOO":{name:"Jack Doohan",nat:"Australia",flag:"au",num:7,dob:"2003-01-20",debut:2024,bio:"Hijo del campeón de MotoGP Mick Doohan. Debutó en el GP de Abu Dhabi 2024 con Alpine. Reemplazado por Colapinto a mitad de 2025."}
};

// ============ TEAMS INFO (datos fijos) ============
// Los IDs son los códigos cortos usados en SEASONS.constructors
const TEAMS_INFO={
"MER":{name:"Mercedes-AMG Petronas",displayName:"MERCEDES",base:"Brackley, Reino Unido",principal:"Toto Wolff",founded:2010,engine:"Mercedes",bio:"Ocho títulos consecutivos de constructores (2014-2021). Volvió a sus raíces Silver Arrows en 2026 con una dupla Russell/Antonelli."},
"RBR":{name:"Oracle Red Bull Racing",displayName:"RED BULL",base:"Milton Keynes, Reino Unido",principal:"Laurent Mekies",founded:2005,engine:"Honda RBPT",bio:"Cuatro títulos de constructores. Dominio con Verstappen entre 2022 y 2024. Motor propio (Red Bull Powertrains) desde 2026."},
"FER":{name:"Scuderia Ferrari",displayName:"FERRARI",base:"Maranello, Italia",principal:"Frédéric Vasseur",founded:1950,engine:"Ferrari",bio:"La escudería más antigua y laureada de la F1 con 16 títulos de constructores. Fichó a Hamilton en 2025."},
"MCL":{name:"McLaren F1 Team",displayName:"McLAREN",base:"Woking, Reino Unido",principal:"Andrea Stella",founded:1966,engine:"Mercedes",bio:"Nueve títulos de constructores. Regresó al tope con la dupla Norris/Piastri, ganando el título en 2024 y 2025."},
"AMR":{name:"Aston Martin Aramco F1",displayName:"ASTON MARTIN",base:"Silverstone, Reino Unido",principal:"Andy Cowell",founded:2021,engine:"Mercedes / Honda (2026)",bio:"Renombrado desde Racing Point en 2021. Propiedad de Lawrence Stroll. Adrian Newey se incorporó en 2025."},
"ALP":{name:"BWT Alpine F1 Team",displayName:"ALPINE",base:"Enstone, Reino Unido",principal:"Steve Nielsen",founded:2021,engine:"Renault / Mercedes (2026)",bio:"Heredero de Lotus/Renault. Renombrado Alpine en 2021. Ganó el GP de Hungría 2021 con Ocon."},
"WIL":{name:"Williams Racing",displayName:"WILLIAMS",base:"Grove, Reino Unido",principal:"James Vowles",founded:1977,engine:"Mercedes",bio:"Nueve títulos de constructores. Propiedad de Dorilton Capital desde 2020. Reconstrucción en curso con Sainz y Albon."},
"HAS":{name:"MoneyGram Haas F1 Team",displayName:"HAAS",base:"Kannapolis, EE.UU.",principal:"Ayao Komatsu",founded:2016,engine:"Ferrari",bio:"Único equipo estadounidense del grid. Dirigido por Ayao Komatsu desde 2024."},
"SAU":{name:"Stake F1 Team Kick Sauber",displayName:"SAUBER",base:"Hinwil, Suiza",principal:"Jonathan Wheatley",founded:1993,engine:"Ferrari",bio:"Equipo suizo histórico. Corrió como Alfa Romeo entre 2019 y 2023. Se convirtió en Audi en 2026."},
"AUD":{name:"Audi F1 Team",displayName:"AUDI",base:"Hinwil, Suiza",principal:"Jonathan Wheatley",founded:2026,engine:"Audi",bio:"Primera aparición de Audi como equipo de F1 tras la compra de Sauber. Dupla Hülkenberg/Bortoleto en su debut."},
"ARO":{name:"Alfa Romeo Racing",displayName:"ALFA ROMEO",base:"Hinwil, Suiza",principal:"Frédéric Vasseur",founded:2019,engine:"Ferrari",bio:"Nombre usado por Sauber entre 2019 y 2023 bajo acuerdo de patrocinio con Alfa Romeo."},
"ATR":{name:"Scuderia AlphaTauri",displayName:"ALPHATAURI",base:"Faenza, Italia",principal:"Franz Tost",founded:2020,engine:"Honda",bio:"Equipo B de Red Bull. Nombre usado entre 2020 y 2023 antes de rebrandearse como Racing Bulls."},
"RBT":{name:"Visa Cash App Racing Bulls",displayName:"RACING BULLS",base:"Faenza, Italia",principal:"Alan Permane",founded:2024,engine:"Honda RBPT",bio:"Equipo B de Red Bull (antes AlphaTauri). Renombrado en 2024. Alan Permane asumió como director en 2025."},
"CAD":{name:"Cadillac F1 Team",displayName:"CADILLAC",base:"Fishers, EE.UU.",principal:"Graeme Lowdon",founded:2026,engine:"Ferrari",bio:"Nueva incorporación al grid de F1 en 2026. Propiedad de TWG Motorsports (General Motors). Debutó con la dupla Bottas/Pérez."}
};
