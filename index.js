const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const cors = require('cors');
const port = process.env.PORT || 5000;
const jwt = require('jsonwebtoken');
const { urlencoded } = require('express');
require('dotenv').config();
const nodemailer = require('nodemailer');
const sgTransport = require('nodemailer-sendgrid-transport');


app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hlrbv.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


const options = {
    auth: {
        api_key: process.env.EMAIL_SENDER_KEY
    }
}

const emailClient = nodemailer.createTransport(sgTransport(options));



async function run() {

    try {
        await client.connect();
        console.log('db is connected');

        const servicesCollection = client.db('doctors_portal').collection('services');

        const bookingCollection = client.db('doctors_portal').collection('bookings');

        const userCollection = client.db('doctors_portal').collection('users');

        const doctorCollection = client.db('doctors_portal').collection('doctors');


        function verifyJWT(req, res, next) {
            // console.log('abc');
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).send({ message: 'Unauthorized Access' });
            };
            const token = authHeader.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
                if (err) {
                    return res.status(403).send({ message: 'Forbidden Access' })
                }
                req.decoded = decoded;
                next();
            });

        };

        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requsterAccount = await userCollection.findOne({ email: requester });
            if (requsterAccount.role === 'admin') {
                next();
            }
            else {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
        }

        function sendAppointmentEmail(info) {
            const { patientName, treatment, date, email, slot } = info;

            const confirmaionEmail = {
                from: process.env.EMAIL_SENDER,
                to: email,
                subject: `Appointment for ${treatment} on ${date}`,
                text: `Hello ${patientName},your Appointment for ${treatment} on ${date} slot ${slot} is confirmed.You are requested to appear the hospital 30 mins before your appointment.Till then stay safe and take care.`,
                html: `
                <div>
                    <p>Hello ${patientName},your Appointment for ${treatment} on ${date} slot ${slot} is confirmed.You are requested to appear the hospital 30 mins before your appointment.Till then stay safe and take care.</p>

                    <p>Best Regards</p>
                    <p>Doctors Portal Suport team.</p>
                    <p>See our loaction</p>
                    <a href="https://doctors-portal-33f00.web.app/">Our Location</a>
                </div>
                `
            };

            emailClient.sendMail(confirmaionEmail, function (err, info) {
                if (err) {
                    console.log(err);
                }
                else {
                    console.log('Message sent: ', + info.response);
                }
            });
        }

        app.post('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(result);
        });

        app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await doctorCollection.find({}).toArray();
            res.send(result);
        });

        app.delete('/doctors/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const result = await doctorCollection.deleteOne({ email: email });
            res.send(result);
        })

        app.get('/services', async (req, res) => {
            const query = {};
            const cursor = servicesCollection.find(query).project({ name: 1 });
            const result = await cursor.toArray();
            res.send(result);
        });

        app.get('/available', async (req, res) => {
            const date = req.query.date;
            const query = { date: date };
            const services = await servicesCollection.find({}).toArray();
            const bookings = await bookingCollection.find(query).toArray();

            services.forEach(service => {
                const serviceBooking = bookings.filter(b => b.treatment === service.name);
                const booked = serviceBooking.map(s => s.slot);
                const available = service.slots.filter(s => !booked.includes(s));
                service.slots = available;
            })


            res.send(services);
        });

        app.post('/booking', async (req, res) => {
            const info = req.body;
            const query = { treatment: info.treatment, date: info.date, patientName: info.patientName };
            const exist = await bookingCollection.findOne(query);
            if (exist) {
                return res.send({ success: false, info: exist })
            };
            const result = await bookingCollection.insertOne(info);
            console.log('sending email');
            sendAppointmentEmail(info);
            res.send({ success: true, result });
        });


        app.get('/booking', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const deocdedEmail = req.decoded.email;
            if (deocdedEmail === email) {
                const appointment = await bookingCollection.find({ email: email }).toArray();
                return res.send(appointment);
            }
            else {
                return res.status(403).send({ message: 'Forbidden Access' })
            }
        });

        app.put('/user/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requsterAccount = await userCollection.findOne({ email: requester });
            if (requsterAccount.role === 'admin') {
                const filter = { email: email };;
                const updatedDoc = {
                    $set: { role: 'admin' },
                };
                const result = await userCollection.updateOne(filter, updatedDoc);
                res.send(result);
            }
            else {
                res.status(403).send({ message: 'Forbidden Access' });
            }

        });

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin });
        })

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const userInfo = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updatedDoc = {
                $set: userInfo,
            };
            const result = await userCollection.updateOne(filter, updatedDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' })
            res.send({ result, token });
        });

        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollection.find({}).toArray();
            res.send(users);
        })
    }

    finally {

    }
}


app.get('/', (req, res) => {
    res.send('Hello from doctors portal server');
});

app.listen(port, () => {
    console.log('Listening to port', port);
});

run().catch(console.dir);
