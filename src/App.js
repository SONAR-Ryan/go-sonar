import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Papa from 'papaparse';
import _ from 'lodash';

const App = () => {
  const [portStats, setPortStats] = useState({});
  const [rankedPorts, setRankedPorts] = useState([]);
  const [selectedPort, setSelectedPort] = useState('');
  const [transitTimeByPort, setTransitTimeByPort] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    // Define ranked port pairs inside useEffect to avoid dependency warnings
    const rankedPortPairs = [
      "CNYTN--USSEA",
      "CNSHA--USSEA",
      "CNNGB--USSEA",
      "BDCGP--USNYC",
      "CNXMN--USSEA",
      "THLCH--USSEA",
      "VNSGN--USSEA",
      "CNTAO--USSEA",
      "VNHPH--USSEA",
      "INNSA--USNYC",
      "VNSGN--USLAX",
      "CNYTN--USLAX",
      "THLKR--USSEA",
      "CNSHA--USLAX",
      "CNTAO--USLAX",
      "BDCGP--USLAX",
      "PKBIN--USNYC",
      "ZADUR--USNYC",
      "INMUN--USNYC",
      "IDSIN--USSEA"
    ];
    
    const fetchData = async () => {
      try {
        setIsLoading(true);
        // Use fetch to get the CSV data
        const response = await fetch('/data/maritime_shipment_data.csv');
        const csvText = await response.text();
        
        Papa.parse(csvText, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            // Filter out rows with missing transit times
            const validData = results.data.filter(row => 
              row.transit_time !== null && 
              row.transit_time !== undefined && 
              !isNaN(row.transit_time) &&
              row.carrier_name && 
              row.port_2_port_id
            );
            
            // Create a lookup for port ranking
            const portRankLookup = {};
            rankedPortPairs.forEach((port, index) => {
              portRankLookup[port] = index + 1;
            });
            
            // Check which ranked port pairs exist in our data
            const portsWithData = [];
            const portPairsInData = {};
            rankedPortPairs.forEach(port => {
              const count = validData.filter(row => row.port_2_port_id === port).length;
              if (count > 0) {
                portsWithData.push(port);
                portPairsInData[port] = count;
              }
            });
            
            // Calculate transit time statistics for ranked port pairs
            const portStats = {};
            portsWithData.forEach(port => {
              const portData = validData.filter(row => row.port_2_port_id === port);
              const carrierGroups = _.groupBy(portData, 'carrier_name');
              
              // Calculate average transit time for this lane across all carriers
              const allTransitTimes = portData
                .filter(row => row.transit_time !== null)
                .map(row => row.transit_time / 24); // Convert hours to days
              
              const laneAvgTransitTime = allTransitTimes.length > 0 ? 
                _.mean(allTransitTimes) : 0;
              
              portStats[port] = {
                rank: portRankLookup[port],
                totalShipments: portPairsInData[port],
                averageTransitTime: parseFloat(laneAvgTransitTime.toFixed(2)),
                carriers: {}
              };
              
              Object.keys(carrierGroups).forEach(carrier => {
                const carrierData = carrierGroups[carrier].filter(row => row.transit_time !== null);
                if (carrierData.length > 0) {
                  const transitTimes = carrierData.map(row => row.transit_time / 24); // Convert hours to days
                  const avgTransit = _.mean(transitTimes);
                  const minTransit = _.min(transitTimes);
                  const maxTransit = _.max(transitTimes);
                  const stdDev = calculateStandardDeviation(transitTimes);
                  
                  // Calculate absolute range (max - min)
                  const absoluteRange = maxTransit - minTransit;
                  
                  // Calculate normalized range relative to average transit time
                  // This measures consistency relative to the route length
                  const normalizedRange = avgTransit > 0 ? 
                    absoluteRange / avgTransit : 0;
                  
                  // Calculate coefficient of variation (std dev / mean)
                  // This is a standardized measure of dispersion
                  const coefficientOfVariation = avgTransit > 0 ? 
                    stdDev / avgTransit : 0;
                  
                  // Calculate lane-specific consistency score (0-100, higher is better)
                  // Base it on normalized range - lower range = better consistency
                  const consistencyScore = Math.max(0, 100 - (normalizedRange * 100));
                  
                  portStats[port].carriers[carrier] = {
                    avgTransitDays: parseFloat(avgTransit.toFixed(2)),
                    minTransitDays: parseFloat(minTransit.toFixed(2)),
                    maxTransitDays: parseFloat(maxTransit.toFixed(2)),
                    shipmentCount: carrierData.length,
                    standardDeviation: parseFloat(stdDev.toFixed(2)),
                    absoluteRange: parseFloat(absoluteRange.toFixed(2)),
                    normalizedRange: parseFloat(normalizedRange.toFixed(2)),
                    coefficientOfVariation: parseFloat(coefficientOfVariation.toFixed(2)),
                    consistencyScore: parseFloat(consistencyScore.toFixed(1))
                  };
                }
              });
            });
            
            // Sort port pairs according to the user's ranking
            const sortedPorts = portsWithData.sort((a, b) => portRankLookup[a] - portRankLookup[b]);
            
            setPortStats(portStats);
            setRankedPorts(sortedPorts);
            setSelectedPort(sortedPorts.length > 0 ? sortedPorts[0] : '');
            setIsLoading(false);
          },
          error: (error) => {
            setError(`Error parsing CSV: ${error}`);
            setIsLoading(false);
          }
        });
      } catch (error) {
        setError(`Error fetching data: ${error}`);
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  // Helper function to calculate standard deviation
  const calculateStandardDeviation = (values) => {
    if (!values || values.length === 0) return 0;
    
    const avg = _.mean(values);
    const squareDiffs = values.map(value => {
      const diff = value - avg;
      return diff * diff;
    });
    const avgSquareDiff = _.mean(squareDiffs);
    return Math.sqrt(avgSquareDiff);
  };
  
  useEffect(() => {
    if (selectedPort && portStats[selectedPort]) {
      const portData = [];
      
      Object.keys(portStats[selectedPort].carriers).forEach(carrier => {
        const carrierStats = portStats[selectedPort].carriers[carrier];
        portData.push({
          carrier,
          avgTransitDays: carrierStats.avgTransitDays,
          minTransitDays: carrierStats.minTransitDays,
          maxTransitDays: carrierStats.maxTransitDays,
          shipmentCount: carrierStats.shipmentCount,
          absoluteRange: carrierStats.absoluteRange,
          normalizedRange: carrierStats.normalizedRange,
          consistencyScore: carrierStats.consistencyScore
        });
      });
      
      // Sort carriers by average transit time
      portData.sort((a, b) => a.avgTransitDays - b.avgTransitDays);
      setTransitTimeByPort(portData);
    }
  }, [selectedPort, portStats]);
  
  const handlePortChange = (e) => {
    setSelectedPort(e.target.value);
  };
  
  // Create a summary of carriers' average performance across all ranked lanes
  const getCarrierSummary = () => {
    const carrierStats = {};
    
    // Calculate total and count for each carrier
    Object.values(portStats).forEach(portStat => {
      Object.entries(portStat.carriers).forEach(([carrier, stats]) => {
        if (!carrierStats[carrier]) {
          carrierStats[carrier] = { 
            totalDays: 0,
            laneCount: 0,
            shipmentCount: 0,
            totalConsistencyScore: 0,
            weightedConsistencyTotal: 0,
            totalWeightingFactor: 0,
            lanes: []
          };
        }
        
        carrierStats[carrier].totalDays += stats.avgTransitDays;
        carrierStats[carrier].laneCount += 1;
        carrierStats[carrier].shipmentCount += stats.shipmentCount;
        carrierStats[carrier].totalConsistencyScore += stats.consistencyScore;
        
        // Weighted consistency based on shipment count for this lane
        // This gives more importance to consistency on frequently used lanes
        const weightingFactor = stats.shipmentCount;
        carrierStats[carrier].weightedConsistencyTotal += (stats.consistencyScore * weightingFactor);
        carrierStats[carrier].totalWeightingFactor += weightingFactor;
        
        // Add lane data for detailed analysis
        carrierStats[carrier].lanes.push({
          portId: portStat.rank,
          avgTransitDays: stats.avgTransitDays,
          consistencyScore: stats.consistencyScore,
          shipmentCount: stats.shipmentCount
        });
      });
    });
    
    // Calculate final metrics for each carrier
    return Object.entries(carrierStats)
      .map(([carrier, stats]) => {
        // Average consistency score across all lanes (unweighted)
        const avgConsistencyScore = stats.laneCount > 0 ? 
          stats.totalConsistencyScore / stats.laneCount : 0;
        
        // Weighted average consistency score based on shipment volume by lane
        const weightedConsistencyScore = stats.totalWeightingFactor > 0 ? 
          stats.weightedConsistencyTotal / stats.totalWeightingFactor : 0;
        
        return {
          carrier,
          // Basic stats
          avgDays: parseFloat((stats.totalDays / stats.laneCount).toFixed(2)),
          laneCount: stats.laneCount,
          shipmentCount: stats.shipmentCount,
          
          // Enhanced consistency metrics
          avgConsistencyScore: parseFloat(avgConsistencyScore.toFixed(1)),
          weightedConsistencyScore: parseFloat(weightedConsistencyScore.toFixed(1)),
          
          // Keep lane-specific data for detailed views
          lanes: stats.lanes
        };
      })
      .sort((a, b) => a.avgDays - b.avgDays);
  };
  
  // Get carriers who serve the most routes/lanes
  const getMostReliableCarriers = () => {
    return getCarrierSummary().sort((a, b) => {
      // Primary sort by lane count, secondary sort by shipment count
      if (b.laneCount !== a.laneCount) {
        return b.laneCount - a.laneCount;
      }
      return b.shipmentCount - a.shipmentCount;
    }).slice(0, 3);
  };
  
  // Get carriers with the best consistency score
  const getMostConsistentCarriers = () => {
    return getCarrierSummary()
      .filter(carrier => carrier.laneCount > 1) // At least 2 lanes to be meaningful
      .sort((a, b) => b.weightedConsistencyScore - a.weightedConsistencyScore)
      .slice(0, 3);
  };
  
  const carrierSummary = getCarrierSummary();
  const mostReliableCarriers = getMostReliableCarriers();
  const mostConsistentCarriers = getMostConsistentCarriers();
  
  // Function to format port names for display
  const formatPortName = (portId) => {
    if (!portId) return '';
    
    const [origin, destination] = portId.split('--');
    // Extract the country code and port code
    let originCountry = origin.substr(0, 2);
    let originPort = origin.substr(2);
    let destCountry = destination.substr(0, 2);
    let destPort = destination.substr(2);
    
    // Map country codes to names
    const countryMap = {
      'CN': 'China',
      'US': 'USA',
      'VN': 'Vietnam',
      'TH': 'Thailand',
      'IN': 'India',
      'BD': 'Bangladesh',
      'PK': 'Pakistan',
      'ID': 'Indonesia',
      'ZA': 'South Africa'
    };
    
    // Map port codes to names
    const portMap = {
      'YTN': 'Yantian',
      'SHA': 'Shanghai',
      'SEA': 'Seattle',
      'LAX': 'Los Angeles',
      'NYC': 'New York',
      'NGB': 'Ningbo',
      'XMN': 'Xiamen',
      'TAO': 'Qingdao',
      'SGN': 'Ho Chi Minh',
      'HPH': 'Haiphong',
      'LCH': 'Laem Chabang',
      'LKR': 'Laem Krabang',
      'NSA': 'Nhava Sheva',
      'MUN': 'Mumbai',
      'CGP': 'Chittagong',
      'BIN': 'Karachi',
      'DUR': 'Durban',
      'SIN': 'Singapore'
    };
    
    // Format with the full names if available
    const originName = `${countryMap[originCountry] || originCountry}-${portMap[originPort] || originPort}`;
    const destName = `${countryMap[destCountry] || destCountry}-${portMap[destPort] || destPort}`;
    
    return `${originName} to ${destName}`;
  };
  
  // Function to map transit time to a color indicator
  const getTimeColor = (days) => {
    // Based on a scale: <20 days = green, 20-30 days = yellow, >30 days = red
    if (days < 20) return '#22c55e'; // Green
    if (days < 30) return '#f59e0b'; // Amber
    return '#ef4444'; // Red
  };
  
  // Function to map consistency score to a color
  const getConsistencyColor = (score) => {
    // Based on a scale: >80 = green, 60-80 = yellow, <60 = red
    if (score > 80) return '#22c55e'; // Green
    if (score > 60) return '#f59e0b'; // Amber
    return '#ef4444'; // Red
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-8 max-w-md mx-auto bg-white rounded shadow">
          <h2 className="text-xl font-bold mb-4">Loading Maritime Data...</h2>
          <div className="w-full bg-gray-200 rounded h-2.5 mb-4">
            <div className="bg-blue-600 h-2.5 rounded animate-pulse" style={{ width: '75%' }}></div>
          </div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded shadow max-w-md w-full">
          <div className="text-red-500 text-center mb-4">
            <h2 className="text-xl font-bold mt-2">Error Loading Data</h2>
          </div>
          <p className="mb-4 text-gray-700">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-6">
          <div className="px-6 py-4 bg-gradient-to-r from-blue-700 to-indigo-600 text-white">
            <h1 className="text-2xl font-bold">Meijer Priority Lanes: SONAR Market Carrier Analysis</h1>
            <p className="mt-1 text-blue-100">Carrier performance comparison across Meijer's priority routes based on SONAR market data</p>
          </div>
          
          <div className="p-6">
            {/* Context information */}
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-blue-700">
                    This dashboard analyzes market transit time data for carriers operating on Meijer's priority shipping lanes. It includes carriers that have moved shipments on these lanes - not necessarily carriers Meijer currently uses - to provide market intelligence for carrier selection decisions.
                  </p>
                </div>
              </div>
            </div>

            {/* Key metrics dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 shadow">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold text-blue-800 mb-2">Fastest Carrier</h3>
                    <p className="text-2xl font-bold text-blue-900">{carrierSummary[0]?.carrier || 'N/A'}</p>
                    <p className="text-sm text-blue-700">{carrierSummary[0]?.avgDays.toFixed(1) || 0} days avg. transit time</p>
                  </div>
                  <div className="bg-blue-200 text-blue-800 rounded-full p-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-4 shadow">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold text-indigo-800 mb-2">Most Reliable Carrier</h3>
                    <p className="text-2xl font-bold text-indigo-900">{mostReliableCarriers[0]?.carrier || 'N/A'}</p>
                    <p className="text-sm text-indigo-700">Serves {mostReliableCarriers[0]?.laneCount || 0} priority lanes</p>
                  </div>
                  <div className="bg-indigo-200 text-indigo-800 rounded-full p-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-violet-50 to-violet-100 rounded-lg p-4 shadow">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold text-violet-800 mb-2">Most Consistent Carrier</h3>
                    <p className="text-2xl font-bold text-violet-900">{mostConsistentCarriers[0]?.carrier || 'N/A'}</p>
                    <p className="text-sm text-violet-700">
                      {mostConsistentCarriers[0]?.weightedConsistencyScore.toFixed(1) || 0}/100 consistency score
                      <span className="block text-xs mt-1">Based on lane-specific performance</span>
                    </p>
                  </div>
                  <div className="bg-violet-200 text-violet-800 rounded-full p-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Chart & Table section - Carrier overview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow border border-gray-200">
                <div className="p-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-800">
                    Market Performance of Carriers on Meijer Lanes
                  </h2>
                  <p className="text-sm text-gray-500">Average transit times in days by carrier</p>
                </div>
                <div className="p-4">
                  <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={carrierSummary}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="carrier" />
                        <YAxis
                          label={{ value: 'Avg Transit Time (days)', angle: -90, position: 'insideLeft', offset: -5 }}
                        />
                        <Tooltip
                          formatter={(value, name, props) => {
                            if (name === 'avgDays') return [`${value} days`, 'Avg Transit Time'];
                            if (name === 'weightedConsistencyScore') return [`${value}/100`, 'Consistency Score'];
                            return [value, name];
                          }}
                        />
                        <Legend />
                        <Bar dataKey="avgDays" name="Avg Transit Time (days)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="weightedConsistencyScore" name="Consistency Score" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow border border-gray-200">
                <div className="p-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-800">
                    Carrier Reliability Rankings
                  </h2>
                  <p className="text-sm text-gray-500">
                    Based on lane-specific consistency and coverage
                    <span className="inline-block ml-2 text-xs italic">
                      Higher consistency score indicates more predictable service
                    </span>
                  </p>
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: '350px' }}>
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Carrier
                        </th>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Avg Days
                        </th>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Lanes
                        </th>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Consistency
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {carrierSummary.map((row, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="font-medium text-gray-900">{row.carrier}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <span className="px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full" 
                              style={{ backgroundColor: `${getTimeColor(row.avgDays)}20`, color: getTimeColor(row.avgDays) }}>
                              {row.avgDays}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-gray-700">
                            {row.laneCount}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <div className="flex items-center justify-end">
                              <span className="text-gray-700 mr-2">{row.weightedConsistencyScore.toFixed(1)}</span>
                              <div className="w-16 bg-gray-200 rounded-full h-2">
                                <div className="bg-blue-600 h-2 rounded-full" 
                                  style={{ 
                                    width: `${Math.min(100, row.weightedConsistencyScore)}%`,
                                    backgroundColor: getConsistencyColor(row.weightedConsistencyScore)
                                  }}>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            
            {/* Lane selector */}
            <div className="bg-white rounded-lg shadow border border-gray-200 p-4 mb-6">
              <label htmlFor="lane-selector" className="block text-sm font-medium text-gray-700 mb-2">
                Select Meijer Priority Shipping Lane
              </label>
              <select 
                id="lane-selector"
                value={selectedPort} 
                onChange={handlePortChange}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              >
                {rankedPorts.map((port) => (
                  <option key={port} value={port}>
                    {`${portStats[port].rank}. ${formatPortName(port)} (${portStats[port].totalShipments} shipments)`}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Lane-specific analysis */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-lg shadow border border-gray-200">
                <div className="p-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-800">
                    Transit Time Analysis: {formatPortName(selectedPort)}
                  </h2>
                  <p className="text-sm text-gray-500">
                    Compare market carrier performance on this lane
                  </p>
                </div>
                <div className="p-4">
                  <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={transitTimeByPort}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="carrier" />
                        <YAxis 
                          label={{ value: 'Transit Time (days)', angle: -90, position: 'insideLeft', offset: -5 }} 
                        />
                        <Tooltip 
                          formatter={(value, name) => {
                            if (name === 'avgTransitDays') return [`${value} days`, 'Avg Transit Time'];
                            if (name === 'minTransitDays') return [`${value} days`, 'Min Transit Time'];
                            if (name === 'maxTransitDays') return [`${value} days`, 'Max Transit Time'];
                            return [value, name];
                          }}
                        />
                        <Legend />
                        <Bar dataKey="minTransitDays" name="Min Transit Time" fill="#93c5fd" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="avgTransitDays" name="Avg Transit Time" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="maxTransitDays" name="Max Transit Time" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow border border-gray-200">
                <div className="p-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-800">
                    Lane-Specific Consistency: {formatPortName(selectedPort)}
                  </h2>
                  <p className="text-sm text-gray-500">
                    How consistent is each carrier on this specific lane?
                  </p>
                </div>
                <div className="p-4">
                  <div className="space-y-4">
                    {transitTimeByPort.map((carrier, index) => (
                      <div key={index} className="bg-gray-50 p-3 rounded-lg">
                        <div className="flex justify-between mb-1">
                          <span className="font-medium text-gray-700">{carrier.carrier}</span>
                          <span className="text-sm text-gray-500">
                            {carrier.consistencyScore ? `${carrier.consistencyScore.toFixed(1)}/100` : 'N/A'}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-1">
                          <div 
                            className="h-2.5 rounded-full" 
                            style={{ 
                              width: `${Math.min(100, carrier.consistencyScore || 0)}%`,
                              backgroundColor: getConsistencyColor(carrier.consistencyScore || 0)
                            }}>
                          </div>
                        </div>
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>Range: {carrier.absoluteRange} days</span>
                          <span>{carrier.shipmentCount} shipments</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Data table */}
            <div className="bg-white rounded-lg shadow border border-gray-200 mb-6">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-800">
                  Detailed Carrier Comparison: {formatPortName(selectedPort)}
                </h2>
                <p className="text-sm text-gray-500">
                  Complete transit time statistics and consistency metrics
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Carrier
                      </th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Avg Transit
                      </th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Min-Max
                      </th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Consistency
                      </th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Shipments
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {transitTimeByPort.map((row, index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 hover:bg-gray-100'}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="font-medium text-gray-900">{row.carrier}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <span className="px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                            {row.avgTransitDays} days
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-gray-700">
                          {row.minTransitDays} - {row.maxTransitDays} days
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <span className="px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full" 
                            style={{ 
                              backgroundColor: `${getConsistencyColor(row.consistencyScore)}20`, 
                              color: getConsistencyColor(row.consistencyScore)
                            }}>
                            {row.consistencyScore ? row.consistencyScore.toFixed(1) : 'N/A'}/100
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                            {row.shipmentCount}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Consistency explanation card */}
            <div className="bg-indigo-50 rounded-lg shadow border border-indigo-200 p-4 mb-6">
              <h3 className="text-lg font-semibold text-indigo-800 mb-2">About Consistency Scoring</h3>
              <p className="text-sm text-indigo-700 mb-2">
                The consistency score measures how predictable a carrier's transit times are within each specific shipping lane.
              </p>
              <div className="space-y-2 text-sm text-indigo-700">
                <p>
                  <span className="font-medium">Higher scores (80-100)</span>: Minimal variation in transit times – highly predictable
                </p>
                <p>
                  <span className="font-medium">Medium scores (60-80)</span>: Moderate variation in transit times – reasonably predictable
                </p>
                <p>
                  <span className="font-medium">Lower scores (&lt;60)</span>: High variation in transit times – less predictable service
                </p>
              </div>
              <p className="text-sm text-indigo-700 mt-2">
                The weighted consistency score accounts for shipping volume, giving more importance to performance on frequently used lanes.
              </p>
            </div>
          </div>
        </div>
        
        <div className="text-center text-sm text-gray-600">
          <p>Meijer Shipping Lanes SONAR Market Analysis | Data Last Updated: February 2025</p>
        </div>
      </div>
    </div>
  );
};

export default App;