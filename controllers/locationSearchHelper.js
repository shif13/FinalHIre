// Enhanced Global Location Search with Geological Accuracy
// This supports hierarchical search: Country -> State/Region -> City

const buildLocationQuery = (searchLocation) => {
  if (!searchLocation || !searchLocation.trim()) {
    return { condition: '', params: [] };
  }

  const location = searchLocation.trim().toLowerCase();
  
  // COMPREHENSIVE GLOBAL LOCATION HIERARCHY
  const locationHierarchy = {
    // ===================================
    // ASIA
    // ===================================
    
    // INDIA - Complete hierarchy
    'india': {
      type: 'country',
      aliases: ['india', 'indian', 'bharat', 'hindustan'],
      regions: [
        // North India
        'delhi', 'delhi ncr', 'haryana', 'punjab', 'himachal pradesh', 'uttarakhand', 
        'jammu and kashmir', 'ladakh', 'chandigarh',
        
        // South India
        'tamil nadu', 'karnataka', 'kerala', 'andhra pradesh', 'telangana', 
        'puducherry', 'lakshadweep',
        
        // West India
        'maharashtra', 'gujarat', 'rajasthan', 'goa', 'daman and diu', 'dadra and nagar haveli',
        
        // East India
        'west bengal', 'odisha', 'bihar', 'jharkhand', 'sikkim',
        
        // Northeast India
        'assam', 'arunachal pradesh', 'nagaland', 'manipur', 'mizoram', 'tripura', 'meghalaya',
        
        // Central India
        'madhya pradesh', 'chhattisgarh', 'uttar pradesh'
      ]
    },
    
    // Tamil Nadu
    'tamil nadu': {
      type: 'state',
      aliases: ['tamil nadu', 'tn', 'tamilnadu'],
      country: 'india',
      cities: [
        'chennai', 'madras', 'coimbatore', 'madurai', 'tiruchirappalli', 'trichy', 
        'salem', 'tirupur', 'erode', 'tirunelveli', 'vellore', 'thoothukudi', 'tuticorin',
        'dindigul', 'thanjavur', 'ranipet', 'sivakasi', 'karur', 'udhagamandalam', 'ooty',
        'hosur', 'nagercoil', 'kanchipuram', 'kumbakonam', 'tiruvannamalai', 'pollachi',
        'rajapalayam', 'gudiyatham', 'pudukkottai', 'tambaram', 'avadi', 'tiruppur'
      ]
    },
    
    'chennai': {
      type: 'city',
      aliases: ['chennai', 'madras', 'chennai city'],
      state: 'tamil nadu',
      areas: ['t nagar', 'anna nagar', 'adyar', 'velachery', 'omr', 'tambaram', 
              'chrompet', 'porur', 'sholinganallur', 'perungudi', 'guindy', 'mylapore']
    },
    
    // Karnataka
    'karnataka': {
      type: 'state',
      aliases: ['karnataka', 'ka', 'karnatakar'],
      country: 'india',
      cities: [
        'bangalore', 'bengaluru', 'mysore', 'mysuru', 'mangalore', 'mangaluru', 
        'hubli', 'hubballi', 'belgaum', 'belagavi', 'dharwad', 'gulbarga', 'kalaburagi',
        'bellary', 'ballari', 'bijapur', 'vijayapura', 'shimoga', 'shivamogga', 
        'tumkur', 'tumakuru', 'raichur', 'davangere', 'udupi', 'hassan', 'mandya'
      ]
    },
    
    'bangalore': {
      type: 'city',
      aliases: ['bangalore', 'bengaluru', 'blr', 'bengaluru city'],
      state: 'karnataka',
      areas: ['whitefield', 'electronic city', 'koramangala', 'indiranagar', 'marathahalli',
              'jp nagar', 'btm layout', 'hsr layout', 'jayanagar', 'malleshwaram']
    },
    
    // Maharashtra
    'maharashtra': {
      type: 'state',
      aliases: ['maharashtra', 'mh'],
      country: 'india',
      cities: [
        'mumbai', 'bombay', 'pune', 'nagpur', 'thane', 'nashik', 'aurangabad',
        'solapur', 'amravati', 'kolhapur', 'sangli', 'jalgaon', 'akola', 'latur',
        'dhule', 'ahmednagar', 'chandrapur', 'parbhani', 'ichalkaranji', 'jalna',
        'bhiwandi', 'navi mumbai', 'kalyan', 'vasai', 'panvel'
      ]
    },
    
    'mumbai': {
      type: 'city',
      aliases: ['mumbai', 'bombay', 'mumbai city'],
      state: 'maharashtra',
      areas: ['andheri', 'bandra', 'juhu', 'worli', 'powai', 'goregaon', 'malad',
              'borivali', 'thane', 'navi mumbai', 'vashi', 'kharghar']
    },
    
    'pune': {
      type: 'city',
      aliases: ['pune', 'poona', 'pune city'],
      state: 'maharashtra',
      areas: ['hinjewadi', 'wakad', 'pimpri', 'chinchwad', 'kothrud', 'shivajinagar',
              'koregaon park', 'viman nagar', 'hadapsar', 'magarpatta']
    },
    
    // Delhi & NCR
    'delhi': {
      type: 'state',
      aliases: ['delhi', 'new delhi', 'delhi ncr', 'ncr', 'national capital region'],
      country: 'india',
      cities: [
        'new delhi', 'delhi', 'gurgaon', 'gurugram', 'noida', 'greater noida',
        'faridabad', 'ghaziabad', 'bahadurgarh', 'sonipat', 'rohtak', 'panipat',
        'dwarka', 'rohini', 'pitampura', 'janakpuri', 'laxmi nagar', 'saket'
      ]
    },
    
    // Other major Indian states (abbreviated for space)
    'west bengal': {
      type: 'state',
      aliases: ['west bengal', 'wb', 'bengal'],
      country: 'india',
      cities: ['kolkata', 'calcutta', 'howrah', 'durgapur', 'asansol', 'siliguri', 'bardhaman']
    },
    
    'gujarat': {
      type: 'state',
      aliases: ['gujarat', 'gj'],
      country: 'india',
      cities: ['ahmedabad', 'surat', 'vadodara', 'baroda', 'rajkot', 'bhavnagar', 'jamnagar', 'gandhinagar']
    },
    
    'rajasthan': {
      type: 'state',
      aliases: ['rajasthan', 'rj'],
      country: 'india',
      cities: ['jaipur', 'jodhpur', 'udaipur', 'kota', 'ajmer', 'bikaner', 'alwar']
    },
    
    'telangana': {
      type: 'state',
      aliases: ['telangana', 'ts'],
      country: 'india',
      cities: ['hyderabad', 'secunderabad', 'warangal', 'nizamabad', 'karimnagar', 'khammam']
    },
    
    'kerala': {
      type: 'state',
      aliases: ['kerala', 'kl'],
      country: 'india',
      cities: ['kochi', 'cochin', 'thiruvananthapuram', 'trivandrum', 'kozhikode', 'calicut', 'thrissur', 'kollam']
    },
    
    // ===================================
    // MIDDLE EAST
    // ===================================
    
    // Saudi Arabia
    'saudi arabia': {
      type: 'country',
      aliases: ['saudi arabia', 'saudi', 'ksa', 'kingdom of saudi arabia'],
      regions: ['eastern province', 'riyadh region', 'makkah region', 'madinah region', 
                'asir region', 'tabuk region', 'hail region', 'northern borders', 
                'jazan region', 'najran region', 'al bahah', 'al jouf']
    },
    
    'eastern province': {
      type: 'region',
      aliases: ['eastern province', 'eastern region', 'ash sharqiyah'],
      country: 'saudi arabia',
      cities: ['dammam', 'khobar', 'al khobar', 'dhahran', 'jubail', 'al jubail',
               'hofuf', 'al hofuf', 'mubarraz', 'qatif', 'al qatif', 'ras tanura',
               'abqaiq', 'khafji', 'nairyah']
    },
    
    'riyadh region': {
      type: 'region',
      aliases: ['riyadh region', 'riyadh province'],
      country: 'saudi arabia',
      cities: ['riyadh', 'al riyadh', 'kharj', 'al kharj', 'diriyah', 'majmaah']
    },
    
    'makkah region': {
      type: 'region',
      aliases: ['makkah region', 'mecca region', 'makkah province'],
      country: 'saudi arabia',
      cities: ['jeddah', 'jiddah', 'mecca', 'makkah', 'taif', 'al taif', 'rabigh']
    },
    
    'riyadh': {
      type: 'city',
      aliases: ['riyadh', 'ar riyadh', 'riyad'],
      region: 'riyadh region',
      areas: ['olaya', 'al malaz', 'diplomatic quarter', 'al muraba']
    },
    
    'jeddah': {
      type: 'city',
      aliases: ['jeddah', 'jiddah', 'jedda'],
      region: 'makkah region',
      areas: ['al balad', 'al hamra', 'al rawdah', 'obhur']
    },
    
    'dammam': {
      type: 'city',
      aliases: ['dammam', 'ad dammam'],
      region: 'eastern province'
    },
    
    'jubail': {
      type: 'city',
      aliases: ['jubail', 'al jubail', 'al jubayl'],
      region: 'eastern province'
    },
    
    // UAE
    'uae': {
      type: 'country',
      aliases: ['uae', 'united arab emirates', 'emirates'],
      regions: ['dubai', 'abu dhabi', 'sharjah', 'ajman', 'umm al quwain', 
                'ras al khaimah', 'fujairah']
    },
    
    'dubai': {
      type: 'emirate',
      aliases: ['dubai', 'dubayy', 'dxb'],
      country: 'uae',
      areas: ['downtown', 'marina', 'jlt', 'jbr', 'deira', 'bur dubai', 'business bay']
    },
    
    'abu dhabi': {
      type: 'emirate',
      aliases: ['abu dhabi', 'abudhabi', 'abu zabi'],
      country: 'uae',
      areas: ['corniche', 'al reem', 'yas island', 'saadiyat']
    },
    
    // Qatar
    'qatar': {
      type: 'country',
      aliases: ['qatar', 'katar', 'state of qatar'],
      cities: ['doha', 'al wakrah', 'al rayyan', 'al khor', 'mesaieed', 'dukhan']
    },
    
    'doha': {
      type: 'city',
      aliases: ['doha', 'ad dawhah'],
      country: 'qatar',
      areas: ['west bay', 'the pearl', 'lusail', 'msheireb']
    },
    
    // Kuwait
    'kuwait': {
      type: 'country',
      aliases: ['kuwait', 'state of kuwait'],
      cities: ['kuwait city', 'hawalli', 'salmiya', 'farwaniya', 'ahmadi', 'jahra']
    },
    
    // Oman
    'oman': {
      type: 'country',
      aliases: ['oman', 'sultanate of oman'],
      cities: ['muscat', 'salalah', 'sohar', 'nizwa', 'sur', 'barka']
    },
    
    // Bahrain
    'bahrain': {
      type: 'country',
      aliases: ['bahrain', 'kingdom of bahrain'],
      cities: ['manama', 'muharraq', 'riffa', 'hamad town', 'isa town', 'sitra']
    },
    
    // ===================================
    // NORTH AMERICA
    // ===================================
    
    'united states': {
      type: 'country',
      aliases: ['united states', 'usa', 'us', 'america', 'united states of america'],
      regions: ['california', 'texas', 'florida', 'new york', 'illinois', 'pennsylvania',
                'ohio', 'georgia', 'north carolina', 'michigan', 'new jersey', 'virginia']
    },
    
    'california': {
      type: 'state',
      aliases: ['california', 'ca', 'calif'],
      country: 'united states',
      cities: ['los angeles', 'la', 'san francisco', 'sf', 'san diego', 'san jose', 
               'sacramento', 'fresno', 'oakland', 'long beach']
    },
    
    'texas': {
      type: 'state',
      aliases: ['texas', 'tx'],
      country: 'united states',
      cities: ['houston', 'dallas', 'san antonio', 'austin', 'fort worth', 'el paso']
    },
    
    'canada': {
      type: 'country',
      aliases: ['canada', 'ca'],
      regions: ['ontario', 'quebec', 'british columbia', 'alberta', 'manitoba', 'saskatchewan']
    },
    
    // ===================================
    // EUROPE
    // ===================================
    
    'united kingdom': {
      type: 'country',
      aliases: ['united kingdom', 'uk', 'britain', 'great britain', 'england'],
      regions: ['england', 'scotland', 'wales', 'northern ireland']
    },
    
    'england': {
      type: 'region',
      aliases: ['england'],
      country: 'united kingdom',
      cities: ['london', 'birmingham', 'manchester', 'liverpool', 'leeds', 'sheffield', 'bristol']
    },
    
    'germany': {
      type: 'country',
      aliases: ['germany', 'deutschland', 'de'],
      cities: ['berlin', 'munich', 'hamburg', 'cologne', 'frankfurt', 'stuttgart', 'dusseldorf']
    },
    
    'france': {
      type: 'country',
      aliases: ['france', 'fr'],
      cities: ['paris', 'marseille', 'lyon', 'toulouse', 'nice', 'nantes', 'bordeaux']
    },
    
    // ===================================
    // SOUTHEAST ASIA
    // ===================================
    
    'singapore': {
      type: 'country',
      aliases: ['singapore', 'sg', 'singapura'],
      areas: ['central', 'orchard', 'marina bay', 'sentosa', 'jurong']
    },
    
    'malaysia': {
      type: 'country',
      aliases: ['malaysia', 'my'],
      cities: ['kuala lumpur', 'kl', 'johor bahru', 'george town', 'penang', 'ipoh', 'petaling jaya']
    },
    
    'thailand': {
      type: 'country',
      aliases: ['thailand', 'th', 'siam'],
      cities: ['bangkok', 'chiang mai', 'phuket', 'pattaya', 'krabi', 'hua hin']
    },
    
    // ===================================
    // EAST ASIA
    // ===================================
    
    'china': {
      type: 'country',
      aliases: ['china', 'prc', 'peoples republic of china'],
      cities: ['beijing', 'shanghai', 'guangzhou', 'shenzhen', 'chengdu', 'wuhan', 'tianjin']
    },
    
    'japan': {
      type: 'country',
      aliases: ['japan', 'nippon', 'nihon'],
      cities: ['tokyo', 'osaka', 'kyoto', 'yokohama', 'nagoya', 'sapporo', 'fukuoka']
    },
    
    'south korea': {
      type: 'country',
      aliases: ['south korea', 'korea', 'republic of korea', 'rok'],
      cities: ['seoul', 'busan', 'incheon', 'daegu', 'daejeon', 'gwangju']
    },
    
    // ===================================
    // AUSTRALIA & OCEANIA
    // ===================================
    
    'australia': {
      type: 'country',
      aliases: ['australia', 'au', 'aussie'],
      regions: ['new south wales', 'victoria', 'queensland', 'western australia', 'south australia']
    },
    
    'new zealand': {
      type: 'country',
      aliases: ['new zealand', 'nz', 'aotearoa'],
      cities: ['auckland', 'wellington', 'christchurch', 'hamilton', 'tauranga']
    }
  };
  
  // Function to get all matching locations recursively
  const getAllMatchingLocations = (searchTerm) => {
    const matches = new Set();
    const searchLower = searchTerm.toLowerCase();
    
    // Helper to add all aliases
    const addAliases = (data) => {
      if (data.aliases) {
        data.aliases.forEach(alias => matches.add(alias));
      }
    };
    
    // Helper to add all children recursively
    const addChildren = (data) => {
      // Add regions
      if (data.regions) {
        data.regions.forEach(region => {
          const regionData = locationHierarchy[region];
          if (regionData) {
            addAliases(regionData);
            addChildren(regionData);
          } else {
            matches.add(region);
          }
        });
      }
      
      // Add cities
      if (data.cities) {
        data.cities.forEach(city => {
          const cityData = locationHierarchy[city];
          if (cityData) {
            addAliases(cityData);
            addChildren(cityData);
          } else {
            matches.add(city);
          }
        });
      }
      
      // Add areas
      if (data.areas) {
        data.areas.forEach(area => matches.add(area));
      }
    };
    
    // Search in hierarchy
    for (const [key, data] of Object.entries(locationHierarchy)) {
      // Check if key matches
      if (key === searchLower || (data.aliases && data.aliases.includes(searchLower))) {
        addAliases(data);
        addChildren(data);
        matches.add(key);
      }
      
      // Check if search term is in children
      if (data.cities && data.cities.includes(searchLower)) {
        addAliases(data);
        matches.add(searchLower);
      }
      
      if (data.regions && data.regions.includes(searchLower)) {
        addAliases(data);
        matches.add(searchLower);
      }
      
      if (data.areas && data.areas.includes(searchLower)) {
        matches.add(searchLower);
      }
    }
    
    // If no matches found, return original search term
    if (matches.size === 0) {
      matches.add(searchTerm);
    }
    
    return Array.from(matches);
  };
  
  const matchingLocations = getAllMatchingLocations(location);
  
  // Build SQL condition
  const conditions = matchingLocations.map(() => 'LOWER(location) LIKE ?').join(' OR ');
  const params = matchingLocations.map(loc => `%${loc}%`);
  
  return {
    condition: conditions ? `(${conditions})` : '',
    params: params
  };
};

module.exports = { buildLocationQuery };