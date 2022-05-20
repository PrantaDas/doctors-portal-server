const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const cors = require('cors');
const port = process.env.PORT || 5000;
const jwt = require('jsonwebtoken');
const query = require('express/lib/middleware/query');
require('dotenv').config();


app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hlrbv.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


async function run() {

    try {
        await client.connect();
        console.log('db is connected');

        const servicesCollection = client.db('doctors_portal').collection('services');

        const bookingCollection = client.db('doctors_portal').collection('bookings');

        const userCollection = client.db('doctors_portal').collection('users');


        app.get('/services', async (req, res) => {
            const query = {};
            const cursor = servicesCollection.find(query);
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
            res.send({ success: true, result });
        });


        app.get('/booking', async (req, res) => {
            const email = req.query.email;
            console.log(email);
            const appointment = await bookingCollection.find({ email: email }).toArray();
            res.send(appointment);
        });

        app.put('/user/:email', async (req, res) => {
            const email = req.query.email;
            const userInfo = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updatedDoc = {
                $set: userInfo,
            };
            const result = await userCollection.updateOne(filter, updatedDoc, options);
            res.send(result);
        });
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
