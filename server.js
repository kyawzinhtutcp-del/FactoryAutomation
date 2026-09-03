const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');

const app = express();

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Treasure@22', // ကိုယ့် MySQL password ထည့်ရန်
    database: 'factory_db'
});

db.connect((err) => {
    if (err) throw err;
    console.log('MySQL Database Connected Successfully!');
});

// Email ပို့ရန် Nodemailer သတ်မှတ်ခြင်း
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'kyawzinhtut@yatharcho.com', // သင်၏ Gmail လိပ်စာ
        pass: 'KZH@ytci' // သင်၏ Gmail App Password
    }
});

// Dashboard View (Fixed for duplicates)
// Dashboard View - Line/Section အလိုက် Duplicate မပါဘဲ စုထုတ်ရန်
// Dashboard View - စက်ရုံအလုပ်လုပ်ပုံ အစဉ်လိုက် (Sequence) အတိုင်း ပေါ်လာစေရန်
app.get('/', (req, res) => {
    // machine_id (သို့မဟုတ် sequence order) အလိုက် အစဉ်လိုက် စီရန်
    let query = `
        SELECT MIN(machine_id) as machine_id, line_name, machine_section, machine_name 
        FROM machines 
        GROUP BY line_name, machine_section, machine_name 
        ORDER BY line_name, machine_section, machine_id ASC
    `;
    
    db.query(query, (err, machines) => {
        if (err) throw err;
        res.render('index', { machines: machines });
    });
});
// Machine History View
app.get('/machine/:id', (req, res) => {
    const machineId = req.params.id;
    db.query('SELECT * FROM machines WHERE machine_id = ?', [machineId], (err, machineResult) => {
        if (err) throw err;
        db.query('SELECT * FROM maintenance_history WHERE machine_id = ? ORDER BY maintenance_date DESC', [machineId], (err, historyResult) => {
            if (err) throw err;
            res.render('history', { 
                machine: machineResult[0], 
                history: historyResult 
            });
        });
    });
});

// Add Form
app.get('/add', (req, res) => {
    const selectedMachineId = req.query.machine_id || '';
    db.query('SELECT * FROM machines', (err, machines) => {
        if (err) throw err;
        res.render('add', { machines: machines, selectedMachineId: selectedMachineId });
    });
});

// Save New Record
app.post('/add', (req, res) => {
    const { machine_id, maintenance_date, maintenance_type, issue_task, parts_replaced, replaced_quantity, technician_engineer } = req.body;
    let query = `INSERT INTO maintenance_history (machine_id, maintenance_date, maintenance_type, issue_task, parts_replaced, replaced_quantity, technician_engineer) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    
    db.query(query, [machine_id, maintenance_date, maintenance_type, issue_task, parts_replaced, replaced_quantity, technician_engineer], (err, result) => {
        if (err) throw err;
        res.redirect(`/machine/${machine_id}`);
    });
});

// Edit Form
app.get('/edit/:id', (req, res) => {
    const recordId = req.params.id;
    db.query('SELECT * FROM maintenance_history WHERE record_id = ?', [recordId], (err, recordResult) => {
        if (err) throw err;
        db.query('SELECT * FROM machines', (err, machines) => {
            if (err) throw err;
            res.render('edit', { record: recordResult[0], machines: machines });
        });
    });
});

// Update Record
app.post('/edit/:id', (req, res) => {
    const recordId = req.params.id;
    const { machine_id, maintenance_date, maintenance_type, issue_task, parts_replaced, replaced_quantity, technician_engineer } = req.body;
    
    let query = `UPDATE maintenance_history SET machine_id = ?, maintenance_date = ?, maintenance_type = ?, issue_task = ?, parts_replaced = ?, replaced_quantity = ?, technician_engineer = ? WHERE record_id = ?`;
    
    db.query(query, [machine_id, maintenance_date, maintenance_type, issue_task, parts_replaced, replaced_quantity, technician_engineer, recordId], (err, result) => {
        if (err) throw err;
        res.redirect(`/machine/${machine_id}`);
    });
});

// Professional PDF Print Format
app.get('/print-pdf/:id', (req, res) => {
    const recordId = req.params.id;
    let query = `
        SELECT m.line_name, m.machine_section, m.machine_name, h.* FROM maintenance_history h
        JOIN machines m ON h.machine_id = m.machine_id
        WHERE h.record_id = ?
    `;
    db.query(query, [recordId], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).send('Record not found');
        }
        const row = results[0];

        const doc = new PDFDocument({ margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=maintenance_report_${recordId}.pdf`);
        doc.pipe(res);

        // Header Style
        doc.rect(50, 40, 512, 50).fill('#198754');
        doc.fillColor('#FFFFFF').fontSize(18).text('FACTORY MAINTENANCE REPORT', 50, 55, { align: 'center' });
        doc.moveDown(2);

        // Details Section
        doc.fillColor('#000000').fontSize(11);
        doc.text(`Record ID: #${row.record_id}`, { continued: true });
        doc.text(`Date: ${row.maintenance_date.toISOString().split('T')[0]}`, { align: 'right' });
        doc.moveDown();

        // Machine Info Box
        doc.rect(50, doc.y, 512, 60).stroke('#cccccc');
        let currentY = doc.y + 10;
        doc.text(`Line Name: ${row.line_name}`, 60, currentY);
        doc.text(`Section: ${row.machine_section}`, 320, currentY);
        currentY += 20;
        doc.text(`Machine Name: ${row.machine_name}`, 60, currentY);
        doc.moveDown(3);

        // Maintenance Details Table Format
        doc.fontSize(12).fillColor('#198754').text('Maintenance Details', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor('#000000');
        
        doc.text(`Maintenance Type:`, { continued: true, bold: true }).text(` ${row.maintenance_type}`);
        doc.text(`Parts Replaced:`, { continued: true }).text(` ${row.parts_replaced || 'None'}`);
        doc.text(`Replaced Quantity:`, { continued: true }).text(` ${row.replaced_quantity || 0}`);
        doc.text(`Technician / Engineer:`, { continued: true }).text(` ${row.technician_engineer}`);
        doc.moveDown();

        doc.text('Issue & Task Description:');
        doc.rect(50, doc.y, 512, 50).stroke('#cccccc');
        doc.text(row.issue_task, 60, doc.y + 10, { width: 492 });

        doc.end();
    });
});

// Send Email Route
app.get('/send-email/:id', (req, res) => {
    const recordId = req.params.id;
    let query = `
        SELECT m.line_name, m.machine_section, m.machine_name, h.* FROM maintenance_history h
        JOIN machines m ON h.machine_id = m.machine_id
        WHERE h.record_id = ?
    `;
    db.query(query, [recordId], (err, results) => {
        if (err || results.length === 0) {
            return res.send("<script>alert('Record not found!'); window.history.back();</script>");
        }
        const row = results[0];

        const mailOptions = {
            from: 'your_email@gmail.com',
            to: 'manager_email@gmail.com', // ပို့လိုသည့် Manager/Supervisor ၏ Email လိပ်စာ
            subject: `Maintenance Report: ${row.machine_name} (${row.line_name})`,
            text: `
Hello Manager,

A new maintenance record has been submitted. Here are the details:

- Date: ${row.maintenance_date.toISOString().split('T')[0]}
- Line: ${row.line_name} (Section ${row.machine_section})
- Machine: ${row.machine_name}
- Maintenance Type: ${row.maintenance_type}
- Issue / Task: ${row.issue_task}
- Parts Replaced: ${row.parts_replaced || 'None'} (Qty: ${row.replaced_quantity || 0})
- Technician: ${row.technician_engineer}

Best regards,
Factory Automation System
            `
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log(error);
                return res.send("<script>alert('Failed to send email. Check console.'); window.history.back();</script>");
            }
            res.send("<script>alert('Email sent successfully!'); window.history.back();</script>");
        });
    });
});

app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});