import React, { Component } from 'react';
import './App.css';

import { Machine } from 'xstate';

import fetchJsonp from 'fetch-jsonp';

const statechart = Machine({
  initial : "initial",
  states : {
    initial : {
      on : {
        search : "searching",
        change : "initial"
      }
    },
    searching : {
      on : {
        results : "displaying_results",
        cancel : "initial"
      },
      onEntry : [
        "startHttpRequest",
        "loadingMode"
      ],
      onExit : [
        "cancelHttpRequest",
      ]
    },
    displaying_results : {
      on : {
        zoom : "zoomed_in"
      },
      onEntry : "resultsMode"
    },
    zoomed_in : {
      on : {
        zoom_out : "displaying_results"
      },
      onEntry : "zoomedMode"
    }
  }
});

/** calls onChange when the text is modified, with the value of the text field
 *  calls onSubmit when the search form is submitted.
 */
class SearchForm extends Component {
  render() {
    return (
        <form onSubmit={e => this.props.onSubmit(e)}>
          <input type="search" onChange={(e) => this.props.onChange(e.target.value)} placeholder="Search flicker for images!!"/>
          <div className="buttons">
            <input type="submit" value="Search!"/>
            <input type="button" onClick={(e) => this.props.onCancel()} value="Cancel"/>
          </div>
        </form>
    );
  }
}


class Image extends Component {
  render() {
    return (
        <img
            alt={this.props.alt}
            src={this.props.src}
            onClick={(e) => this.props.onSelect(this.props.src)}
            style={{'--i': this.props.index}}
            className={this.props.className}
        />
    );
  }
}


class ResultsPanel extends Component {
  render() {
    // TODO: for each image in results, show image with zoom control.
    const results = this.props.results.map((result, index) => (
      <Image key={result.media.m} src={result.media.m} onSelect={(e) => this.props.onZoom(result.media.m)} index={index} />
    ));
    return <section className="results">
      {results}
    </section>;
  }
}

/*
 * A business object with a search function that returns a promise of
 * an array of images from flickr.
 */
class BusinessObject {
  search(string) {
    return fetchJsonp(
        `https://api.flickr.com/services/feeds/photos_public.gne?lang=en-us&format=json&tags=${string}`,
        { jsonpCallback: 'jsoncallback' })
        .then(res => res.json())
        .then(data => data.items);
  }
  cancel(string) {
    // Awaiting cancelable fetch()...
  }
}

// A little wrapper that wraps the xstate instance and a "current
// state".  The transition function deals with calling side effects
// to, by blindly invoking any action on the object passed in to the
// constructor.  Also supports delayed events by the way of the syntax
//   after 3 foo ID
// where the foo event is sent after 3 seconds. The ID is used to cancel
// the delayed event.  They are usually used as entry/exit actions of a
// state:
//      onEntry: "after 2.0 timeout1",
//      onExit: "cancel timeout1",
//      on: {
//        timeout: "target"
//      }
// Note that such delayed events are passed to the entire state machine,
// so if other states react to "timeout" they will fire.  Use a unique
// name for the delayed event every time it's used.
class StateMachine {
  constructor(machine, object) {
    this.machine = machine;
    this.object = object;
    this.state = null;

    // Any delayed events setTimeout IDs are kept here.
    this.timers = {}
  }

  event(event) {
    const maybeNextState = ! this.state ? this.machine.initialState : this.machine.transition(this.state, event);
    if (maybeNextState) {
      this.state = maybeNextState;
      if (this.state.actions) {
        this.state.actions.filter(item => item.startsWith("cancel ")).forEach(item => this.timer(item));
        this.state.actions.filter(item => item.startsWith("after ")).forEach(item => this.timer(item));
        this.state.actions
          .filter(item => !item.startsWith("cancel "))
          .filter(item => !item.startsWith("after "))
          .forEach(item => this.object[item]());
      }
    }
  }

  // Invoke with a string like
  //   "after 3.0s event"
  // or
  //   "cancel event"
  timer(args) {
    args = args.split(" ");
    if (args[0] == "after") {
      this.timers[args[2]] = setTimeout(() => {
        console.log("Sending delayed event " + args.join(" "));
        this.event(args[2]);
        delete this.timers[args[3]];
      }, parseFloat(args[1]) * 1000);
    }
    else if (args[0] == "cancel") {
      const timer = this.timers[args[1]];
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}



class App extends Component {
  constructor(props) {
    super(props);

    // the business object where the backend chatting happens
    this.business = new BusinessObject();

    // The state that the UI cares about
    this.state = {
      // the "mode" of the UI, controlled by the actions
      mode: "none",

      // The currently "selected image" if any
      selectedImage: null,

      // the state in the text field
      text: "",

      // the results to show to the user
      results: []
    };


    // Where we are in our state machine
    this.stateMachine = new StateMachine(statechart, this);
    this.stateMachine.event();// ensure the initial state is entered!
  }

  render() {
    const loading = this.state.mode == "loading" ? <div className="loading">Loading, please wait</div> : null;
    const results = this.state.mode == "results" ? <ResultsPanel onZoom={e => this.handleZoom(e)} results={this.state.results}/> : null;
    const zoomed = this.state.mode == "zoomed" ? <Image className="zoomed-in" src={this.state.selectedImage} onSelect={e => this.stateMachine.event('unzoom')}/> : null;
 
    return (
      <div className={this.state.mode}>
        <SearchForm onChange={e => { this.setState({text: e}); this.stateMachine.event('change'); } }
                    onSubmit={e => { this.stateMachine.event('search'); e.preventDefault(); }}
                    onCancel={e => this.stateMachine.event('cancel')}
        />
        {loading}
        {zoomed}
        {results}
      </div>
    );
  }

  loadingMode() {
    this.setState({"mode": "loading"});
  }

  resultsMode() {
    this.setState({"mode": "results"});
  }

  zoomedMode() {
    this.setState({"mode": "zoomed"});
  }

  handleZoom(what) {
    this.setState({selectedImage:  what});
    this.stateMachine.event('zoom');
  }

  startHttpRequest() {
    this.XHR = setTimeout(() => {
      this.business.search(this.state.text)
        .then(results => {
          console.log(results);
          this.setState({results});
          this.stateMachine.event('results');
        });
    }, Math.random() ** 4 * 3000); // mostly short requests, but intermittent "slowness"
  }

  cancelHttpRequest() {
    if (this.XHR) {
      clearTimeout(this.XHR);
      this.XHR = null;
    }
  }

}

export default App;
