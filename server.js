require("dotenv").config();
if (!process.env.BREVO_API_KEY) {
  console.error("❌ BREVO_API_KEY missing");
  process.exit(1);
}

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const XLSX = require("xlsx");
const fs = require("fs");
const axios = require("axios");
/*const nodemailer = require("nodemailer");

const brevoClient = SibApiV3Sdk.ApiClient.instance;
brevoClient.authentications["api-key"].apiKey =
  process.env.BREVO_API_KEY;

const emailApi = new SibApiV3Sdk.TransactionalEmailsApi();*/




const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const STUDENTS_FILE = "./students.json";
const LOGS_FILE = "./logs.json";
const upload = multer({ dest: "uploads/" });

/* Utils */
const todayMMDD = () => {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
};

const getStudents = () => {
  if (!fs.existsSync(STUDENTS_FILE)) return [];
  return JSON.parse(fs.readFileSync(STUDENTS_FILE, "utf-8"));
};
const getLogs = () => {
  if (!fs.existsSync(LOGS_FILE)) return [];
  return JSON.parse(fs.readFileSync(LOGS_FILE, "utf-8"));
};

const saveLogs = (data) =>
  fs.writeFileSync(LOGS_FILE, JSON.stringify(data, null, 2));

/* Email Transporter 
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});*/
async function sendBirthdayEmail(student) {
  await axios.post(
    "https://api.brevo.com/v3/smtp/email",
    {
      sender: {
        name: "Nayaruvi WishFlow",
        email: "manojkumar2742007@gmail.com" // VERIFIED SENDER
      },
      to: [
        {
          email: student.email,
          name: student.name
        }
      ],
      subject: "🎉 Happy Birthday!",
      htmlContent: `
        <h2>🎂 Happy Birthday ${student.name}!</h2>
        <p>Wishing you a joyful and successful year ahead.</p>
        <br/>
        <p><b>— Nayaruvi WishFlow</b></p>
      `
    },
    {
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "content-type": "application/json",
        "accept": "application/json"
      }
    }
  );
}


/* MAIN API */
app.get("/api/birthdays/today", async (req, res) => {
  const today = todayMMDD();
  const students = getStudents();
  let logs = getLogs();

  const todaysStudents = students.filter((s) => s.dob === today);
  const records = [];

  for (const stu of todaysStudents) {
    const alreadyLogged = logs.find(
      l => l.sid === stu.id && l.date === today && l.status === "SENT"
    );


    if (alreadyLogged) {
      records.push(alreadyLogged);
      continue;
    }

    let status = "SENT";

    try {
      if (stu.email) {
        await sendBirthdayEmail(stu);
      } else {
        status = "FAILED";
      }
    } catch (err) {
      console.error("Email failed:", err.response?.text || err.message);
      status = "FAILED";
    }


    const entry = {
      date: today,
      time: new Date().toLocaleTimeString(),
      name: stu.name,
      phone: stu.phone,
      email: stu.email,
      sid: stu.id,
      status
    };

    logs.push(entry);
    records.push(entry);
  }
  

  saveLogs(logs);

  res.json({
    date: new Date().toDateString(),
    totalSent: records.filter(r => r.status === "SENT").length,
    records
  });
});

app.post("/api/students/upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheetData = XLSX.utils.sheet_to_json(
      workbook.Sheets[sheetName]
    );

    if (!sheetData.length) {
      return res.status(400).json({ message: "Empty Excel file" });
    }

    const students = getStudents();
    let count = students.length;

    sheetData.forEach(row => {
      if (!row.name || !row.phone || !row.dob) return;

      count++;

      students.push({
        id: "STU" + String(count).padStart(3, "0"),
        name: String(row.name).trim(),
        phone: String(row.phone).trim(),
        email: row.email ? String(row.email).trim() : "",
        dob: String(row.dob).trim()
      });
    });

    fs.writeFileSync(
      STUDENTS_FILE,
      JSON.stringify(students, null, 2)
    );

    fs.unlinkSync(req.file.path); // cleanup temp file

    res.json({
      message: "Students uploaded successfully",
      totalAdded: sheetData.length
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Upload failed" });
  }
});

app.get("/api/students", (req, res) => {
  try {
    const students = getStudents();
    res.json(students);
  } catch (err) {
    res.status(500).json({ message: "Failed to load students" });
  }
});

/* Health */
app.get("/", (_, res) => {
  res.json({
    status: "OK",
    service: "WishFlow Backend",
    time: new Date().toISOString()
  });
});


app.listen(3000, () =>
  console.log("WishFlow backend started on port 3000")
);
