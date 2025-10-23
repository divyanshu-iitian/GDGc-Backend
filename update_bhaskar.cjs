const { MongoClient } = require('mongodb');
const fs = require('fs');

const MONGODB_URI = 'mongodb+srv://divyanshumishra0806_db_user:77K64gX5xX14nxmW@cluster0.xrv8slm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function updateBhaskar() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('gdgc-leaderboard');
    const collection = db.collection('profiles');
    
    // Read Bhaskar's titles
    const titles = [
      "AI Boost Bites: Presentation Scripts with Gemini",
      "Build Real World AI Applications with Gemini and Imagen",
      "Develop Gen AI Apps with Gemini and Streamlit",
      "Build a Website on Google Cloud",
      "Prompt Design in Vertex AI",
      "Monitoring in Google Cloud",
      "Analyze Speech and Language with Google APIs",
      "Cloud Speech API: 3 Ways",
      "Store, Process, and Manage Data on Google Cloud - Console",
      "Set Up a Google Cloud Network",
      "Cloud Run Functions: 3 Ways",
      "App Engine: 3 Ways",
      "Develop with Apps Script and AppSheet",
      "App Building with AppSheet",
      "Get Started with Google Workspace Tools",
      "Get Started with Dataplex",
      "Get Started with Looker",
      "Get Started with API Gateway",
      "Get Started with Pub/Sub",
      "Get Started with Cloud Storage",
      "The Basics of Google Cloud Compute"
    ];
    
    const profile = {
      url: 'https://www.cloudskillsboost.google/public_profiles/f0bddd33-478f-42ff-b7b8-f32876b92f8b',
      name: 'Bhaskar Patel',
      titles: titles,
      badge_count: titles.length,
      updatedAt: new Date()
    };
    
    const result = await collection.updateOne(
      { url: profile.url },
      { $set: profile },
      { upsert: true }
    );
    
    console.log(`✅ Updated Bhaskar in MongoDB!`);
    console.log(`   Modified: ${result.modifiedCount}`);
    console.log(`   Upserted: ${result.upsertedId ? 1 : 0}`);
    console.log(`   Badge count: ${titles.length}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
  }
}

updateBhaskar();
