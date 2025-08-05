import React, { useState, useMemo, useRef, useEffect } from 'react';
import { FaSearch, FaGlobe, FaChevronDown, FaHistory, FaTimes, FaCheck } from 'react-icons/fa';
import { useDebounce } from '../hooks/useDebounce';

const EnhancedTimezoneSearch = ({
  timezones,
  selectedTimezone,
  onTimezoneSelect,
  loading = false,
  error = null
}) => {
  const [searchTerm, setSearchTerm] = useState(selectedTimezone || '');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [searchHistory, setSearchHistory] = useState([]);
  const debouncedSearch = useDebounce(searchTerm, 200);
  
  const searchInputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Enhanced filtering with multiple criteria
  const filteredTimezones = useMemo(() => {
    if (!debouncedSearch.trim()) {
      return timezones.slice(0, 10); // Show top 10 timezones when no search
    }

    const searchLower = debouncedSearch.toLowerCase().trim();
    
    return timezones
      .filter(timezone => {
        // Search by timezone name (starts with)
        const nameMatch = timezone.toLowerCase().startsWith(searchLower);
        
        // Search by timezone name (contains)
        const nameContainsMatch = timezone.toLowerCase().includes(searchLower);
        
        // Search by GMT offset
        const gmtMatch = timezone.toLowerCase().includes('gmt') && 
                        timezone.toLowerCase().includes(searchLower);
        
        // Search by timezone region (e.g., "America", "Europe", "Asia")
        const regionMatch = timezone.toLowerCase().includes(searchLower);

        return nameMatch || nameContainsMatch || gmtMatch || regionMatch;
      })
      .sort((a, b) => {
        const aName = a.toLowerCase();
        const bName = b.toLowerCase();
        const searchLower = debouncedSearch.toLowerCase();
        
        // Prioritize exact name matches
        if (aName.startsWith(searchLower) && !bName.startsWith(searchLower)) return -1;
        if (!aName.startsWith(searchLower) && bName.startsWith(searchLower)) return 1;
        
        // Then alphabetical
        return aName.localeCompare(bName);
      })
      .slice(0, 20); // Limit to 20 results
  }, [debouncedSearch, timezones]);

  // Categorize results
  const categorizedResults = useMemo(() => {
    if (!debouncedSearch.trim()) {
      return {
        recent: searchHistory.slice(0, 3),
        suggested: filteredTimezones.slice(0, 7)
      };
    }

    const searchLower = debouncedSearch.toLowerCase();
    const exactMatches = [];
    const nameMatches = [];
    const otherMatches = [];

    filteredTimezones.forEach(timezone => {
      if (timezone.toLowerCase() === searchLower) {
        exactMatches.push(timezone);
      } else if (timezone.toLowerCase().startsWith(searchLower)) {
        nameMatches.push(timezone);
      } else {
        otherMatches.push(timezone);
      }
    });

    return {
      exact: exactMatches,
      names: nameMatches,
      others: otherMatches
    };
  }, [debouncedSearch, filteredTimezones, searchHistory]);

  // Handle timezone selection
  const handleTimezoneSelect = (timezone) => {
    setSearchTerm(timezone);
    setIsDropdownOpen(false);
    setFocusedIndex(-1);
    
    // Add to search history
    setSearchHistory(prev => {
      const filtered = prev.filter(t => t !== timezone);
      return [timezone, ...filtered].slice(0, 5);
    });
    
    onTimezoneSelect(timezone);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    const allResults = [
      ...categorizedResults.exact,
      ...categorizedResults.names,
      ...categorizedResults.others
    ];

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => 
          prev < allResults.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => 
          prev > 0 ? prev - 1 : allResults.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0 && allResults[focusedIndex]) {
          handleTimezoneSelect(allResults[focusedIndex]);
        }
        break;
      case 'Escape':
        setIsDropdownOpen(false);
        setFocusedIndex(-1);
        break;
    }
  };

  // Handle input change
  const handleInputChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    setIsDropdownOpen(true);
    setFocusedIndex(-1);
  };

  // Handle input focus
  const handleInputFocus = () => {
    setIsDropdownOpen(true);
  };

  // Clear search
  const clearSearch = () => {
    setSearchTerm('');
    setIsDropdownOpen(false);
    setFocusedIndex(-1);
  };

  // Update search term when selectedTimezone changes
  useEffect(() => {
    if (selectedTimezone) {
      setSearchTerm(selectedTimezone);
    }
  }, [selectedTimezone]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        !searchInputRef.current.contains(event.target)
      ) {
        setIsDropdownOpen(false);
        setFocusedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Render timezone item
  const renderTimezoneItem = (timezone, index, category = '') => {
    const isFocused = index === focusedIndex;
    const isSelected = selectedTimezone === timezone;
    
    return (
      <div
        key={`${category}-${timezone}`}
        className={`px-3 py-2 cursor-pointer text-xs hover:bg-orange-50 ${
          isFocused ? 'bg-orange-100' : ''
        } ${isSelected ? 'bg-orange-200' : ''}`}
        onClick={() => handleTimezoneSelect(timezone)}
        onMouseEnter={() => setFocusedIndex(index)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FaGlobe size={12} className="text-orange-500" />
            <span className="font-medium">{timezone}</span>
          </div>
          {isSelected && <FaCheck size={12} className="text-green-500" />}
        </div>
      </div>
    );
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Selected timezone display */}
      {/* {selectedTimezone && (
        <div className="mb-2 p-2 bg-orange-50 border border-orange-200 rounded-md">
          <div className="flex items-center gap-2 text-xs">
            <FaGlobe size={12} className="text-orange-600" />
            <span className="text-orange-800 font-medium">Selected:</span>
            <span className="text-orange-900 font-semibold">{selectedTimezone}</span>
          </div>
        </div>
      )} */}
      
      <div className="relative">
        <FaSearch
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-200"
        />
        <input
          ref={searchInputRef}
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder="Search timezones..."
          className="w-full pl-9 pr-8 py-2 border border-orange-300 rounded-md text-xs focus:ring-1 focus:ring-orange-500 bg-white"
          disabled={loading}
        />
        {searchTerm && (
          <button
            onClick={clearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <FaTimes size={12} />
          </button>
        )}
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          <FaChevronDown size={12} />
        </button>
      </div>

      {/* Dropdown */}
      {isDropdownOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-orange-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {loading && (
            <div className="px-3 py-2 text-xs text-gray-500">
              Loading timezones...
            </div>
          )}
          
          {error && (
            <div className="px-3 py-2 text-xs text-red-500">
              Error: {error}
            </div>
          )}

          {!loading && !error && (
            <>
              {/* Recent searches */}
              {categorizedResults.recent && categorizedResults.recent.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-xs font-semibold text-gray-500 bg-gray-50">
                    Recent
                  </div>
                  {categorizedResults.recent.map((timezone, index) =>
                    renderTimezoneItem(timezone, index, 'recent')
                  )}
                </div>
              )}

              {/* Exact matches */}
              {categorizedResults.exact && categorizedResults.exact.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-xs font-semibold text-gray-500 bg-gray-50">
                    Exact Matches
                  </div>
                  {categorizedResults.exact.map((timezone, index) =>
                    renderTimezoneItem(timezone, index, 'exact')
                  )}
                </div>
              )}

              {/* Name matches */}
              {categorizedResults.names && categorizedResults.names.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-xs font-semibold text-gray-500 bg-gray-50">
                    Name Matches
                  </div>
                  {categorizedResults.names.map((timezone, index) =>
                    renderTimezoneItem(timezone, index, 'names')
                  )}
                </div>
              )}

              {/* Other matches */}
              {categorizedResults.others && categorizedResults.others.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-xs font-semibold text-gray-500 bg-gray-50">
                    Other Matches
                  </div>
                  {categorizedResults.others.map((timezone, index) =>
                    renderTimezoneItem(timezone, index, 'others')
                  )}
                </div>
              )}

              {/* Suggested timezones (when no search) */}
              {!debouncedSearch.trim() && categorizedResults.suggested && categorizedResults.suggested.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-xs font-semibold text-gray-500 bg-gray-50">
                    Popular Timezones
                  </div>
                  {categorizedResults.suggested.map((timezone, index) =>
                    renderTimezoneItem(timezone, index, 'suggested')
                  )}
                </div>
              )}

              {/* No results */}
              {debouncedSearch.trim() && 
               categorizedResults.exact.length === 0 && 
               categorizedResults.names.length === 0 && 
               categorizedResults.others.length === 0 && (
                <div className="px-3 py-2 text-xs text-gray-500">
                  No timezones found for "{debouncedSearch}"
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default EnhancedTimezoneSearch; 